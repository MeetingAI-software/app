import type {
  LiveTranscriptRepository,
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { LiveTranscriptBus } from '../adapters/realtime/live-transcript.bus';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import { assertTransition } from '../domain/state-machine';
import type { MeetingStatus, TranscriptSegment } from '../domain/types';
import { logger } from '../config/logger';
import { randomUUID } from 'node:crypto';

interface EventRefs {
  botId: string | null;
  meetingId: string | null;
  statusCode: string | null;
  subCode: string | null;
}

// Provider status detail is untrusted text. Keep only recognized machine-readable codes in
// customer-facing failure reasons; anything else could contain meeting speech or credentials.
const SAFE_PROVIDER_SUB_CODES = new Set(['meeting_not_found', 'no_audio']);
function safeProviderSubCode(value: string | null): string | null {
  return value && SAFE_PROVIDER_SUB_CODES.has(value) ? value : null;
}

/**
 * Pull the identifiers out of a bot-provider webhook payload.
 *
 * The provider's current shape nests everything two levels deep:
 *
 *   { event: 'bot.in_call_recording',
 *     data: { data: { code, sub_code, updated_at },
 *             bot:  { id, metadata: { meetingId } } } }
 *
 * The flat `bot_id` / `meeting_id` / `status.code` shape is still read as a fallback because
 * that is what FakeBotAdapter emits — the fake must stay substitutable for the real thing.
 */
function extractEventRefs(payload: any): EventRefs {
  const parsed = payload ?? {};
  const data = parsed.data ?? {};
  const inner = data.data ?? {};

  const botId = data.bot?.id ?? parsed.bot_id ?? data.bot_id ?? null;

  const meetingId =
    data.bot?.metadata?.meetingId ??
    parsed.metadata?.meetingId ??
    parsed.meeting_id ??
    data.meeting_id ??
    null;

  const statusCode =
    inner.code ??
    parsed.status?.code ??
    (typeof parsed.status === 'string' ? parsed.status : null) ??
    null;

  return {
    botId: botId != null ? String(botId) : null,
    meetingId: meetingId != null ? String(meetingId) : null,
    statusCode: statusCode != null ? String(statusCode) : null,
    subCode: inner.sub_code != null ? String(inner.sub_code) : null,
  };
}

function mapRecallStatusToMeetingStatus(statusCode: string): MeetingStatus | null {
  switch (statusCode) {
    case 'joining_call':
    case 'in_waiting_room':
      return 'bot_joining';
    case 'in_call_not_recording':
    case 'recording_permission_allowed':
    case 'in_call_recording':
      return 'recording';
    case 'recording_done':
    case 'call_ended':
    case 'done':
      return 'processing';
    case 'fatal':
      return 'failed';
    default:
      return null;
  }
}

export class ProcessWebhookEventService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly transcriptRepo: TranscriptRepository,
    private readonly usageRepo: UsageRepository,
    private readonly botAdapter: MeetingBotPort,
    private readonly docGen: DocumentGeneratorPort,
    private readonly liveRepo?: LiveTranscriptRepository,
    private readonly liveBus?: LiveTranscriptBus,
  ) {}

  /**
   * A meeting has reached a terminal state. Tell any open SSE connection to close and refetch,
   * then drop the live rows — the post-call transcript supersedes them, and keeping both would
   * mean the same words stored twice with two different sets of timestamps.
   *
   * Neither step may break the pipeline: the transcript is already saved by this point.
   */
  private async closeLiveTranscript(meetingId: string, status: MeetingStatus): Promise<void> {
    try {
      this.liveBus?.publish(meetingId, { type: 'done', status });
      await this.liveRepo?.deleteByMeeting(meetingId);
    } catch (err: any) {
      logger.warn({ meetingId }, 'Failed to clean up live transcript segments');
    }
  }

  /** One retry. The caller treats a thrown error as "leave summary null and carry on". */
  private async generateSummaryWithRetry(segments: TranscriptSegment[]): Promise<string> {
    try {
      return await this.docGen.generateSummary(segments);
    } catch (err: any) {
      logger.warn('Summary generation failed, retrying once');
      return await this.docGen.generateSummary(segments);
    }
  }

  private async settleBotDuration(meetingId: string, botId: string): Promise<number> {
    const measured = await this.botAdapter.getRecordedDurationSeconds(botId).catch(() => {
      logger.warn({ meetingId }, 'Recording duration unavailable; using reserved maximum');
      return null;
    });
    return this.usageRepo.addSeconds(meetingId, measured);
  }

  async processEvent(
    action: 'transcript_ready' | 'transcript_failed' | 'bot_status_change',
    payload: any
  ): Promise<void> {
    const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const { botId, meetingId, statusCode, subCode: rawSubCode } = extractEventRefs(parsedPayload);
    const subCode = safeProviderSubCode(rawSubCode);

    if (!botId) {
      throw new Error('bot_id is missing from payload');
    }

    // The stored bot ID is the authority. Provider metadata is only a consistency check; using
    // it as a lookup would let one bot's event mutate another account's meeting.
    const meeting = await this.meetingRepo.findByBotId(botId);
    if (!meeting || meeting.botId !== botId || meeting.source !== 'bot') {
      throw new Error('Webhook bot is not bound to a meeting');
    }
    if (meetingId && meetingId !== meeting.id) {
      throw new Error('Webhook meeting binding mismatch');
    }

    if (action === 'transcript_failed') {
      // The provider could not produce a transcript. There is nothing to retry on our side.
      const reason = subCode ? `Transcription failed at provider (${subCode})` : 'Transcription failed at provider';
      if (meeting.status === 'failed') {
        await this.settleBotDuration(meeting.id, botId);
        return;
      }
      if (meeting.status === 'transcribed') {
        return;
      }
      const durationSeconds = await this.settleBotDuration(meeting.id, botId);
      await this.meetingRepo.updateStatus(meeting.id, 'failed', { errorMessage: reason, durationSeconds });
      await this.closeLiveTranscript(meeting.id, 'failed');
      logger.error({ meetingId: meeting.id, ...(subCode ? { subCode } : {}) }, 'Transcription failed at provider');
      return;
    }

    if (action === 'bot_status_change') {
      if (!statusCode) {
        console.warn('⚠️ bot_status_change event is missing status information, skipping.');
        return;
      }

      const nextStatus = mapRecallStatusToMeetingStatus(statusCode);
      if (!nextStatus) {
        console.warn('⚠️ Unrecognized Recall status code, ignoring.');
        return;
      }

      if (meeting.status === nextStatus) {
        if (nextStatus === 'failed') {
          await this.settleBotDuration(meeting.id, botId);
        }
        return;
      }

      try {
        assertTransition(meeting.status, nextStatus);
      } catch {
        logger.warn({ meetingId: meeting.id, from: meeting.status, to: nextStatus },
          'Ignoring invalid bot status transition');
        return;
      }
      console.log(`👷 Transitioning meeting ${meeting.id} status from ${meeting.status} to ${nextStatus}`);

      if (nextStatus === 'failed') {
        // A terminal failure carries the provider's reason in `sub_code` (e.g.
        // `meeting_not_found` when the link is wrong or the call never started). Without it
        // the meeting lands in `failed` with a null errorMessage and the UI has nothing to
        // tell the user.
        const reason = subCode
          ? `Bot could not record the meeting (${subCode})`
          : 'Bot could not record the meeting';
        const durationSeconds = await this.settleBotDuration(meeting.id, botId);
        await this.meetingRepo.updateStatus(meeting.id, nextStatus, { errorMessage: reason, durationSeconds });
        await this.closeLiveTranscript(meeting.id, 'failed');
      } else {
        await this.meetingRepo.updateStatus(meeting.id, nextStatus);
      }
    } else if (action === 'transcript_ready') {
      // A distinct signed event ID can still replay a completed transcript. Reconcile usage
      // idempotently, but do not fetch, save or delete media again in a terminal state.
      if (meeting.status === 'transcribed') {
        await this.settleBotDuration(meeting.id, botId);
        return;
      }
      if (meeting.status === 'failed') {
        await this.settleBotDuration(meeting.id, botId);
        return;
      }
      // Signed events with different IDs (or the reconciler) still target the same bot.
      // Claim its meeting before fetching or reaching the paid summary model.
      const claimId = randomUUID();
      if (!await this.meetingRepo.claimBotTranscript(meeting.id, botId, claimId)) {
        logger.info({ meetingId: meeting.id }, 'Transcript processing already claimed or completed');
        return;
      }
      try {
        logger.info({ meetingId: meeting.id }, 'Processing transcript_ready');
        // Fetch transcript segments
        const segments = await this.botAdapter.fetchTranscript(botId);
      
        // Save transcript
        await this.transcriptRepo.save(meeting.id, segments, payload);

        // Recording time includes silence and is independent of transcript word timestamps.
        // If Recall timing is unavailable, settle the reserved maximum rather than charging zero.
        const durationSeconds = await this.settleBotDuration(meeting.id, botId);

        // Transition the meeting status step-by-step to transcribed
        let currentStatus = meeting.status;
      
        // If meeting is not yet in processing state, transition it step-by-step
        const transitionSteps: MeetingStatus[] = ['bot_joining', 'recording', 'processing', 'transcribed'];
        const startIndex = transitionSteps.indexOf(currentStatus);

        if (startIndex !== -1) {
          for (let i = startIndex; i < transitionSteps.length - 1; i++) {
            const from = transitionSteps[i];
            const to = transitionSteps[i + 1];
            try {
              assertTransition(from, to);
              if (to === 'transcribed') {
                await this.meetingRepo.updateStatus(meeting.id, to, {
                  durationSeconds,
                });
              } else {
                await this.meetingRepo.updateStatus(meeting.id, to);
              }
              console.log(`👷 Step-transitioned meeting ${meeting.id} from ${from} to ${to}`);
            } catch (err: any) {
              console.error(`⚠️ Error during step-transition from ${from} to ${to}`);
              throw err;
            }
          }
        } else {
          // Fallback: direct assertTransition and update
          assertTransition(currentStatus, 'transcribed');
          await this.meetingRepo.updateStatus(meeting.id, 'transcribed', {
            durationSeconds,
          });
        }

        // Done before the summary, which takes seconds: any browser watching the live stream
        // should flip to the finished view as soon as the real transcript exists.
        await this.closeLiveTranscript(meeting.id, 'transcribed');

        // Summary. A missing summary must never block markProcessed or the document button.
        let summarySucceeded = false;
        try {
          const summary = await this.generateSummaryWithRetry(segments);
          await this.meetingRepo.setSummary(meeting.id, summary);
          summarySucceeded = true;
          logger.info({ meetingId: meeting.id }, 'Summary generated');
        } catch (err: any) {
          logger.error(
            { meetingId: meeting.id },
            'Summary generation failed after retry — leaving summary null and continuing'
          );
        }

        // The GDPR promise. Audio is deleted ONLY after the transcript is stored and the
        // summary has proven the pipeline can read it. If anything upstream failed, the
        // audio survives for reprocessing. Deletion failure is non-fatal by design.
        if (summarySucceeded) {
          try {
            await this.botAdapter.deleteRecording(botId);
            logger.info(
              { meetingId: meeting.id },
              'Recording deleted at provider'
            );
          } catch (err: any) {
            logger.warn(
              { meetingId: meeting.id },
              'Failed to delete recording at provider — a sweep job will retry'
            );
          }
        }
      } catch (err) {
        await this.meetingRepo.releaseBotTranscript(meeting.id, claimId);
        throw err;
      }
    }
  }
}
