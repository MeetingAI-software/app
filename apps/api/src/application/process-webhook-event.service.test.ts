import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessWebhookEventService } from './process-webhook-event.service';
import type {
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import type { Meeting, MeetingStatus } from '../domain/types';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: 'https://us02web.zoom.us/j/1',
    platform: 'zoom',
    status: 'bot_joining' as MeetingStatus,
    source: 'bot',
    botId: 'bot-1',
    ownerUserId: 'u1',
    durationSeconds: null,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    shareEnabled: true,
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-01T09:00:00Z'),
    ...overrides,
  };
}

/** The real provider payload: identifiers nested two levels deep under `data`. */
function botEvent(code: string) {
  return {
    event: `bot.${code}`,
    data: {
      data: { code, sub_code: null, updated_at: '2026-08-01T09:01:00Z' },
      bot: { id: 'bot-1', metadata: { meetingId: 'm1' } },
    },
  };
}

describe('ProcessWebhookEventService', () => {
  let meetingRepo: MeetingRepository;
  let transcriptRepo: TranscriptRepository;
  let usageRepo: UsageRepository;
  let bot: MeetingBotPort;
  let docGen: DocumentGeneratorPort;
  let service: ProcessWebhookEventService;

  beforeEach(() => {
    meetingRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(meeting()),
      findByBotId: vi.fn().mockResolvedValue(meeting()),
      findByShareToken: vi.fn(),
      findByTranscriptionJobId: vi.fn(),
      updateStatus: vi.fn().mockImplementation(async (_id, to) => meeting({ status: to })),
      setSummary: vi.fn(),
      listForUser: vi.fn(),
      findByIdForUser: vi.fn(),
      countActiveForUser: vi.fn(),
      listStuck: vi.fn(),
      listForDeletion: vi.fn(),
      markAudioDeleted: vi.fn(),
      setTranscriptionJobId: vi.fn(),
      deleteForUser: vi.fn(),
    } as unknown as MeetingRepository;

    transcriptRepo = { save: vi.fn(), findByMeetingId: vi.fn() } as unknown as TranscriptRepository;
    usageRepo = { addSeconds: vi.fn(), monthlyTotalSeconds: vi.fn() } as unknown as UsageRepository;
    bot = {
      createBot: vi.fn(),
      getBotStatus: vi.fn(),
      fetchTranscript: vi.fn(),
      deleteRecording: vi.fn(),
    };
    docGen = { generateSummary: vi.fn(), generateDocument: vi.fn() } as unknown as DocumentGeneratorPort;

    service = new ProcessWebhookEventService(meetingRepo, transcriptRepo, usageRepo, bot, docGen);
  });

  it('resolves the meeting from the nested payload and advances the status', async () => {
    // Reading `payload.bot_id` threw "bot_id is missing from payload" on every real event.
    await service.processEvent('bot_status_change', botEvent('in_call_recording'));

    expect(meetingRepo.findById).toHaveBeenCalledWith('m1');
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'recording');
  });

  it('reads the status code from data.data.code', async () => {
    await service.processEvent('bot_status_change', botEvent('joining_call'));
    // Already bot_joining, so this is a no-op rather than an illegal transition.
    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('still accepts the flat payload the fake adapter emits', async () => {
    await service.processEvent('bot_status_change', {
      bot_id: 'bot-1',
      meeting_id: 'm1',
      status: { code: 'in_call_recording' },
    });

    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'recording');
  });

  it('throws when no bot id can be found, so the worker retries', async () => {
    await expect(service.processEvent('bot_status_change', { event: 'bot.done', data: {} }))
      .rejects.toThrow('bot_id is missing from payload');
  });

  it('records the failure reason when the bot dies', async () => {
    // `bot.fatal` used to land in `failed` with a null errorMessage, so the UI could only say
    // "no specific error message was reported" for the most common real failure: a bad link.
    await service.processEvent('bot_status_change', {
      event: 'bot.fatal',
      data: {
        data: { code: 'fatal', sub_code: 'meeting_not_found' },
        bot: { id: 'bot-1', metadata: { meetingId: 'm1' } },
      },
    });

    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'failed', {
      errorMessage: 'Bot could not record the meeting (meeting_not_found)',
    });
  });

  it('does not attach an errorMessage to a non-failure transition', async () => {
    await service.processEvent('bot_status_change', botEvent('in_call_recording'));
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'recording');
  });

  it('fails the meeting when the provider reports transcription failure', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'processing' }));

    await service.processEvent('transcript_failed', {
      event: 'transcript.failed',
      data: {
        data: { code: 'failed', sub_code: 'no_audio' },
        bot: { id: 'bot-1', metadata: { meetingId: 'm1' } },
      },
    });

    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'failed', {
      errorMessage: 'Transcription failed at provider (no_audio)',
    });
  });

  it('does not fail a meeting that already transcribed', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'transcribed' }));

    await service.processEvent('transcript_failed', {
      event: 'transcript.failed',
      data: { data: { code: 'failed' }, bot: { id: 'bot-1', metadata: { meetingId: 'm1' } } },
    });

    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });
});
