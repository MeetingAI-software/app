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
import { logger } from '../config/logger';

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
    usageRepo = { addSeconds: vi.fn().mockResolvedValue(3600), monthlyTotalSeconds: vi.fn() } as unknown as UsageRepository;
    bot = {
      createBot: vi.fn(),
      getBotStatus: vi.fn(),
      fetchTranscript: vi.fn(),
      getRecordedDurationSeconds: vi.fn().mockResolvedValue(null),
      deleteRecording: vi.fn(),
    };
    docGen = { generateSummary: vi.fn(), generateDocument: vi.fn() } as unknown as DocumentGeneratorPort;

    service = new ProcessWebhookEventService(meetingRepo, transcriptRepo, usageRepo, bot, docGen);
  });

  it('resolves the meeting from the nested payload and advances the status', async () => {
    // Reading `payload.bot_id` threw "bot_id is missing from payload" on every real event.
    await service.processEvent('bot_status_change', botEvent('in_call_recording'));

    expect(meetingRepo.findByBotId).toHaveBeenCalledWith('bot-1');
    expect(meetingRepo.findById).not.toHaveBeenCalled();
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
      durationSeconds: 3600,
    });
  });

  it('does not attach an errorMessage to a non-failure transition', async () => {
    await service.processEvent('bot_status_change', botEvent('in_call_recording'));
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'recording');
  });

  it('fails the meeting when the provider reports transcription failure', async () => {
    vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status: 'processing' }));

    await service.processEvent('transcript_failed', {
      event: 'transcript.failed',
      data: {
        data: { code: 'failed', sub_code: 'no_audio' },
        bot: { id: 'bot-1', metadata: { meetingId: 'm1' } },
      },
    });

    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'failed', {
      errorMessage: 'Transcription failed at provider (no_audio)',
      durationSeconds: 3600,
    });
  });

  it('never stores an unrecognized provider sub-code containing meeting text', async () => {
    const marker = 'private-meeting-secret';
    await service.processEvent('bot_status_change', {
      event: 'bot.fatal',
      data: {
        data: { code: 'fatal', sub_code: marker },
        bot: { id: 'bot-1', metadata: { meetingId: 'm1' } },
      },
    });
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'failed', {
      errorMessage: 'Bot could not record the meeting', durationSeconds: 3600,
    });
  });

  it('does not log an unrecognized status or summary provider text', async () => {
    const marker = 'PRIVATE-MEETING-SPEECH-and-bearer-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logWarn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      await service.processEvent('bot_status_change', botEvent(marker));
      vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status: 'processing' }));
      vi.mocked(bot.fetchTranscript).mockResolvedValue([{ startMs: 0, endMs: 1000, speaker: 'A', text: marker }]);
      vi.mocked(docGen.generateSummary).mockRejectedValue(new Error(marker));
      await service.processEvent('transcript_ready', botEvent('done'));
      expect(JSON.stringify([warn.mock.calls, logWarn.mock.calls, logError.mock.calls])).not.toContain(marker);
      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'transcribed', { durationSeconds: 3600 });
    } finally {
      warn.mockRestore();
      logWarn.mockRestore();
      logError.mockRestore();
    }
  });

  it('reconciles a failed meeting on repeated failure events', async () => {
    vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status: 'failed' }));

    await service.processEvent('bot_status_change', botEvent('fatal'));
    await service.processEvent('transcript_failed', botEvent('fatal'));

    expect(usageRepo.addSeconds).toHaveBeenCalledTimes(2);
    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('retries a failed bot event when durable usage settlement fails', async () => {
    vi.mocked(usageRepo.addSeconds).mockRejectedValue(new Error('database unavailable'));

    await expect(service.processEvent('bot_status_change', botEvent('fatal')))
      .rejects.toThrow('database unavailable');
    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('does not fail a meeting that already transcribed', async () => {
    vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status: 'transcribed' }));

    await service.processEvent('transcript_failed', {
      event: 'transcript.failed',
      data: { data: { code: 'failed' }, bot: { id: 'bot-1', metadata: { meetingId: 'm1' } } },
    });

    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects cross-account meeting metadata before any status or transcript change', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ id: 'victim', ownerUserId: 'other' }));
    const forged = botEvent('in_call_recording');
    forged.data.bot.metadata.meetingId = 'victim';
    await expect(service.processEvent('bot_status_change', forged))
      .rejects.toThrow('Webhook meeting binding mismatch');
    expect(meetingRepo.findById).not.toHaveBeenCalled();
    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
    expect(transcriptRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a bot lookup that is missing or bound to a different stored bot', async () => {
    vi.mocked(meetingRepo.findByBotId).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(meeting({ botId: 'other-bot' }));
    await expect(service.processEvent('bot_status_change', botEvent('in_call_recording')))
      .rejects.toThrow('Webhook bot is not bound');
    await expect(service.processEvent('bot_status_change', botEvent('in_call_recording')))
      .rejects.toThrow('Webhook bot is not bound');
    expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('charges a long silent bot recording using provider time, not the empty transcript', async () => {
    vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status: 'processing' }));
    vi.mocked(bot.fetchTranscript).mockResolvedValue([]);
    vi.mocked(bot.getRecordedDurationSeconds).mockResolvedValue(1800);
    vi.mocked(usageRepo.addSeconds).mockResolvedValue(1800);
    vi.mocked(docGen.generateSummary).mockResolvedValue('Empty recording');
    await service.processEvent('transcript_ready', botEvent('done'));
    expect(usageRepo.addSeconds).toHaveBeenCalledWith('m1', 1800);
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'transcribed', { durationSeconds: 1800 });
  });

  it('charges the reserved maximum when provider duration lookup fails', async () => {
    vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status: 'processing' }));
    vi.mocked(bot.fetchTranscript).mockResolvedValue([]);
    vi.mocked(bot.getRecordedDurationSeconds).mockRejectedValue(new Error('provider unavailable'));
    vi.mocked(usageRepo.addSeconds).mockResolvedValue(3600);
    vi.mocked(docGen.generateSummary).mockResolvedValue('Empty recording');
    await service.processEvent('transcript_ready', botEvent('done'));
    expect(usageRepo.addSeconds).toHaveBeenCalledWith('m1', null);
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'transcribed', { durationSeconds: 3600 });
  });

  it.each(['transcribed', 'failed'] as const)
    ('avoids duplicate provider work for a replayed transcript in state %s', async status => {
      vi.mocked(meetingRepo.findByBotId).mockResolvedValue(meeting({ status }));
      await service.processEvent('transcript_ready', botEvent('done'));
      expect(bot.fetchTranscript).not.toHaveBeenCalled();
      expect(transcriptRepo.save).not.toHaveBeenCalled();
      // The repository settles once; a replay also repairs a crash after status persistence.
      expect(usageRepo.addSeconds).toHaveBeenCalledWith('m1', null);
    });
});
