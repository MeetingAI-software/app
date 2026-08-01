import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestLiveTranscriptService } from './ingest-live-transcript.service';
import { LiveTranscriptBus, type LiveTranscriptEvent } from '../adapters/realtime/live-transcript.bus';
import type { LiveTranscriptRepository, MeetingRepository } from '../ports/repositories.port';
import type { Meeting, MeetingStatus } from '../domain/types';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: 'https://us02web.zoom.us/j/1',
    platform: 'zoom',
    status: 'recording' as MeetingStatus,
    source: 'bot',
    botId: 'bot-1',
    ownerUserId: 'u1',
    durationSeconds: null,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-01T09:00:00Z'),
    ...overrides,
  };
}

/** The realtime webhook payload, exactly as Recall documents it. Note: no `metadata`. */
function liveEvent(
  event: 'transcript.data' | 'transcript.partial_data',
  words: Array<[string, number, number]>,
  participant: { id?: number; name?: string | null } = { id: 7, name: 'Ada' },
) {
  return {
    event,
    data: {
      data: {
        words: words.map(([text, start, end]) => ({
          text,
          start_timestamp: { relative: start, absolute: '2026-08-01T09:01:00Z' },
          end_timestamp: { relative: end, absolute: '2026-08-01T09:01:01Z' },
        })),
        language_code: 'en',
        participant,
      },
      bot: { id: 'bot-1' },
      recording: { id: 'r1' },
    },
  };
}

describe('IngestLiveTranscriptService', () => {
  let meetingRepo: MeetingRepository;
  let liveRepo: LiveTranscriptRepository;
  let bus: LiveTranscriptBus;
  let published: LiveTranscriptEvent[];
  let service: IngestLiveTranscriptService;
  let nextSeq: number;

  beforeEach(() => {
    nextSeq = 1;
    meetingRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByBotId: vi.fn().mockResolvedValue(meeting()),
      findByShareToken: vi.fn(),
      findByTranscriptionJobId: vi.fn(),
      updateStatus: vi.fn().mockImplementation(async (_id, to) => meeting({ status: to })),
      setSummary: vi.fn(),
      setUploadInfo: vi.fn(),
      countActive: vi.fn(),
      list: vi.fn(),
      findByIdForUser: vi.fn(),
      listForUser: vi.fn(),
      countActiveForUser: vi.fn(),
      deleteById: vi.fn(),
    } as unknown as MeetingRepository;

    liveRepo = {
      append: vi.fn().mockImplementation(async (_id, seg) => ({ seq: nextSeq++, ...seg })),
      listSince: vi.fn().mockResolvedValue([]),
      deleteByMeeting: vi.fn(),
    };

    bus = new LiveTranscriptBus();
    published = [];
    bus.subscribe('m1', (event) => published.push(event));

    service = new IngestLiveTranscriptService(meetingRepo, liveRepo, bus);
  });

  it('persists a finalized utterance and broadcasts it with its cursor', async () => {
    await service.processLiveEvent(liveEvent('transcript.data', [['Hello', 0.5, 0.9], ['there', 1.0, 1.4]]));

    expect(liveRepo.append).toHaveBeenCalledWith('m1', {
      speaker: 'Ada',
      text: 'Hello there',
      startMs: 500,
      endMs: 1400,
    });
    expect(published).toEqual([
      { type: 'segment', segment: { seq: 1, speaker: 'Ada', text: 'Hello there', startMs: 500, endMs: 1400 } },
    ]);
  });

  it('broadcasts a partial without ever persisting it', async () => {
    await service.processLiveEvent(liveEvent('transcript.partial_data', [['fur', 0.5, 0.6]]));

    expect(liveRepo.append).not.toHaveBeenCalled();
    expect(published).toEqual([{ type: 'partial', speaker: 'Ada', text: 'fur' }]);
  });

  it('suppresses a partial that repeats the previous guess', async () => {
    await service.processLiveEvent(liveEvent('transcript.partial_data', [['fur', 0.5, 0.6]]));
    await service.processLiveEvent(liveEvent('transcript.partial_data', [['fur', 0.5, 0.6]]));
    await service.processLiveEvent(liveEvent('transcript.partial_data', [['further', 0.5, 0.8]]));

    expect(published.map(e => e.type === 'partial' && e.text)).toEqual(['fur', 'further']);
  });

  it('resolves the meeting once and reuses it across a burst of utterances', async () => {
    for (let i = 0; i < 5; i++) {
      await service.processLiveEvent(liveEvent('transcript.partial_data', [[`word${i}`, i, i + 1]]));
    }
    // Partials arrive several times a second; a DB round trip per event is the thing this avoids.
    expect(meetingRepo.findByBotId).toHaveBeenCalledTimes(1);
  });

  it('labels an unnamed participant consistently for the whole meeting', async () => {
    const anon = { id: 42, name: null };
    await service.processLiveEvent(liveEvent('transcript.data', [['one', 0, 1]], anon));
    await service.processLiveEvent(liveEvent('transcript.data', [['two', 2, 3]], anon));

    const speakers = published.map(e => (e.type === 'segment' ? e.segment.speaker : null));
    expect(speakers).toEqual(['Speaker 1', 'Speaker 1']);
  });

  it('flips a still-joining meeting to recording on the first words spoken', async () => {
    meetingRepo.findByBotId = vi.fn().mockResolvedValue(meeting({ status: 'bot_joining' }));

    await service.processLiveEvent(liveEvent('transcript.data', [['Hi', 0, 1]]));

    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'recording');
  });

  it('does not re-flip a meeting that is already recording', async () => {
    await service.processLiveEvent(liveEvent('transcript.data', [['Hi', 0, 1]]));
    await service.processLiveEvent(liveEvent('transcript.data', [['again', 2, 3]]));

    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('ignores an unknown bot instead of throwing', async () => {
    meetingRepo.findByBotId = vi.fn().mockResolvedValue(null);

    // Recall must never be handed a 5xx for a partial — a retry would deliver stale text.
    await expect(service.processLiveEvent(liveEvent('transcript.data', [['Hi', 0, 1]]))).resolves.toBeUndefined();
    expect(liveRepo.append).not.toHaveBeenCalled();
  });

  it('ignores payloads with no bot id or no words', async () => {
    await service.processLiveEvent({ event: 'transcript.data', data: { data: { words: [] }, bot: { id: 'bot-1' } } });
    await service.processLiveEvent({ event: 'transcript.data', data: { data: { words: [{ text: 'hi' }] } } });

    expect(liveRepo.append).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it('keeps text with missing timestamps rather than dropping it', async () => {
    // A partial can outrun its own timing data; showing it at 0:00 beats showing nothing.
    await service.processLiveEvent({
      event: 'transcript.partial_data',
      data: { data: { words: [{ text: 'hello' }], participant: { id: 7, name: 'Ada' } }, bot: { id: 'bot-1' } },
    });

    expect(published).toEqual([{ type: 'partial', speaker: 'Ada', text: 'hello' }]);
  });
});
