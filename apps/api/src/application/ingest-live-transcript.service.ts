import type { LiveTranscriptRepository, MeetingRepository } from '../ports/repositories.port';
import type { LiveTranscriptBus } from '../adapters/realtime/live-transcript.bus';
import { createSpeakerResolver, toSeconds } from '../adapters/recall/transcript.normalizer';
import { assertTransition } from '../domain/state-machine';
import type { MeetingStatus, TranscriptSegment } from '../domain/types';
import { logger } from '../config/logger';

/**
 * Recall's realtime webhook payload. Unlike the workspace webhooks handled by
 * ProcessWebhookEventService, this one carries NO `metadata`, so the meeting is resolved by
 * bot id:
 *
 *   { event: 'transcript.data' | 'transcript.partial_data',
 *     data: { data: { words: [{ text, start_timestamp: { relative }, end_timestamp }],
 *                     participant: { id, name } },
 *             bot: { id } } }
 */
interface LiveEventRefs {
  botId: string | null;
  isFinal: boolean;
  words: any[];
  participant: { id?: unknown; name?: unknown } | null;
}

function extractLiveRefs(payload: any): LiveEventRefs {
  const parsed = payload ?? {};
  const data = parsed.data ?? {};
  const inner = data.data ?? {};
  const botId = data.bot?.id ?? parsed.bot_id ?? null;

  return {
    botId: botId != null ? String(botId) : null,
    isFinal: parsed.event !== 'transcript.partial_data',
    words: Array.isArray(inner.words) ? inner.words : [],
    participant: inner.participant ?? null,
  };
}

interface CacheEntry {
  meetingId: string;
  status: MeetingStatus;
  resolveSpeaker: ReturnType<typeof createSpeakerResolver>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;

export class IngestLiveTranscriptService {
  /**
   * Partials arrive several times a second per speaker. Resolving the meeting through Postgres
   * on every one of them would turn a transcript into a load test, so the bot→meeting mapping
   * is memoised for the lifetime of the call. The speaker resolver lives here too, so that an
   * unnamed participant keeps the same `Speaker N` label for the whole meeting.
   */
  private readonly cache = new Map<string, CacheEntry>();

  /** The most recent partial per meeting+speaker. Never persisted — stale within a second. */
  private readonly partials = new Map<string, string>();

  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly liveRepo: LiveTranscriptRepository,
    private readonly bus: LiveTranscriptBus,
  ) {}

  async processLiveEvent(payload: any): Promise<void> {
    const { botId, isFinal, words, participant } = extractLiveRefs(payload);
    if (!botId || words.length === 0) return;

    const entry = await this.resolveMeeting(botId);
    // A bot we don't know about (deleted meeting, another environment sharing the workspace)
    // is not an error worth retrying — Recall must not be told to redeliver a partial.
    if (!entry) return;

    const speaker = entry.resolveSpeaker({ participant });
    const segment = buildSegment(words, speaker);
    if (!segment) return;

    if (!isFinal) {
      const key = `${entry.meetingId}:${speaker}`;
      if (this.partials.get(key) === segment.text) return; // unchanged guess, don't re-broadcast
      this.partials.set(key, segment.text);
      this.bus.publish(entry.meetingId, { type: 'partial', speaker, text: segment.text });
      return;
    }

    this.partials.delete(`${entry.meetingId}:${speaker}`);
    const stored = await this.liveRepo.append(entry.meetingId, segment);
    this.bus.publish(entry.meetingId, { type: 'segment', segment: stored });

    await this.nudgeToRecording(entry);
  }

  /** Drop a meeting's cached mapping once it is over, so the map doesn't grow unbounded. */
  forget(botId: string): void {
    this.cache.delete(botId);
  }

  private async resolveMeeting(botId: string): Promise<CacheEntry | null> {
    const cached = this.cache.get(botId);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const meeting = await this.meetingRepo.findByBotId(botId);
    if (!meeting) {
      logger.debug({ botId }, 'Live transcript event for unknown bot — ignoring');
      return null;
    }

    const entry: CacheEntry = {
      meetingId: meeting.id,
      status: meeting.status,
      // Preserve the numbering already handed out if we're only refreshing an expired entry.
      resolveSpeaker: cached?.resolveSpeaker ?? createSpeakerResolver(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(botId, entry);
    return entry;
  }

  /**
   * Someone is speaking, so the bot is demonstrably in the call and recording. Recall's
   * `bot.in_call_recording` event usually arrives first, but it goes through the webhook outbox
   * and can lag; this flips the UI out of "joining" the instant there is something to show.
   * An illegal transition here is expected (the meeting may already be `recording`) and is
   * swallowed, matching how ProcessWebhookEventService treats status races.
   */
  private async nudgeToRecording(entry: CacheEntry): Promise<void> {
    if (entry.status !== 'pending' && entry.status !== 'bot_joining') return;
    try {
      assertTransition(entry.status, 'recording');
      await this.meetingRepo.updateStatus(entry.meetingId, 'recording');
      entry.status = 'recording';
      logger.info({ meetingId: entry.meetingId }, 'Live transcript started — meeting marked recording');
    } catch (err: any) {
      logger.debug(
        { meetingId: entry.meetingId, err: err?.message },
        'Could not nudge meeting to recording from live transcript',
      );
      // Don't retry on every subsequent utterance.
      entry.status = 'recording';
    }
  }
}

/** Collapse Recall's word array into one utterance, reusing the post-call timestamp parsing. */
function buildSegment(words: any[], speaker: string): TranscriptSegment | null {
  const texts: string[] = [];
  let startMs: number | null = null;
  let endMs: number | null = null;

  for (const word of words) {
    if (!word || typeof word !== 'object') continue;

    const text = String(word.text ?? '').trim().replace(/\s+/g, ' ');
    if (!text) continue;
    texts.push(text);

    const start = toSeconds(word.start_timestamp ?? word.start_time);
    const end = toSeconds(word.end_timestamp ?? word.end_time);
    if (start !== null) startMs = startMs === null ? start * 1000 : Math.min(startMs, start * 1000);
    if (end !== null) endMs = endMs === null ? end * 1000 : Math.max(endMs, end * 1000);
  }

  if (texts.length === 0) return null;

  // A partial can arrive before its timestamps settle; anchoring both ends at 0 keeps the text
  // visible rather than dropping it, and the final utterance overwrites it with real times.
  const start = Math.round(startMs ?? 0);
  const end = Math.round(endMs ?? start);

  return {
    speaker,
    text: texts.join(' '),
    startMs: start,
    endMs: Math.max(start, end),
  };
}
