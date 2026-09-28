import { describe, expect, it, vi } from 'vitest';
import { WebhookWorker } from './worker';
import type { Meeting } from '../domain/types';
import type { MeetingRepository, WebhookEventRepository } from '../ports/repositories.port';
import type { ProcessWebhookEventService } from '../application/process-webhook-event.service';
import type { ProcessUploadEventService } from '../application/process-upload-event.service';
import type { MeetingBotPort } from '../ports/meeting-bot.port';

vi.mock('../adapters/db/client', () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ attempts: 5 }] }) }) },
}));

function makeWorker() {
  const botMeeting = {
    id: 'owned-meeting', source: 'bot', botId: 'stored-bot', status: 'recording',
  } as Meeting;
  const uploadMeeting = {
    id: 'upload-meeting', source: 'upload', transcriptionJobId: 'stored-job', status: 'processing',
  } as Meeting;
  const meetingRepo = {
    findById: vi.fn().mockResolvedValue(uploadMeeting),
    findByBotId: vi.fn().mockResolvedValue(botMeeting),
    findByTranscriptionJobId: vi.fn().mockResolvedValue(uploadMeeting),
    updateStatus: vi.fn(),
  } as unknown as MeetingRepository;
  const webhookRepo = { markProcessed: vi.fn() } as unknown as WebhookEventRepository;
  const worker = new WebhookWorker(
    webhookRepo, meetingRepo, {} as ProcessWebhookEventService,
    {} as ProcessUploadEventService, {} as MeetingBotPort,
  );
  return { worker, meetingRepo, webhookRepo, botMeeting, uploadMeeting };
}

describe('failed webhook meeting resolution', () => {
  it('uses the stored bot binding for nested Recall payloads', async () => {
    const { worker, meetingRepo, botMeeting } = makeWorker();
    const result = await worker['resolveMeetingFromPayload']('transcript.done', {
      data: { bot: { id: 'stored-bot', metadata: { meetingId: 'owned-meeting' } } },
    });
    expect(result).toBe(botMeeting);
    expect(meetingRepo.findByBotId).toHaveBeenCalledWith('stored-bot');
    expect(meetingRepo.findById).not.toHaveBeenCalled();
  });

  it('cannot resolve a different meeting from forged metadata after five retries', async () => {
    const { worker, meetingRepo } = makeWorker();
    const result = await worker['resolveMeetingFromPayload']('transcript.done', {
      data: { bot: { id: 'stored-bot', metadata: { meetingId: 'victim-meeting' } } },
      meeting_id: 'victim-meeting',
    });
    expect(result).toBeNull();
    expect(meetingRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects a missing bot ID even if a meeting ID is present', async () => {
    const { worker, meetingRepo } = makeWorker();
    expect(await worker['resolveMeetingFromPayload']('transcript.done', {
      meeting_id: 'victim-meeting',
    })).toBeNull();
    expect(meetingRepo.findById).not.toHaveBeenCalled();
  });

  it('keeps local upload and signed transcription events bound to their own source', async () => {
    const { worker, meetingRepo, uploadMeeting } = makeWorker();
    expect(await worker['resolveMeetingFromPayload']('audio_uploaded', {
      meetingId: 'upload-meeting',
    })).toBe(uploadMeeting);
    expect(await worker['resolveMeetingFromPayload']('transcription_ready', {
      jobId: 'stored-job', meetingId: 'victim-meeting',
    })).toBe(uploadMeeting);
    expect(meetingRepo.findById).toHaveBeenCalledTimes(1);
    expect(meetingRepo.findByTranscriptionJobId).toHaveBeenCalledWith('stored-job');
  });

  it('does not log or persist raw provider text after the last retry', async () => {
    const marker = 'PRIVATE-MEETING-SPEECH-and-bearer-token';
    const { worker, meetingRepo, webhookRepo } = makeWorker();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await worker['handleProcessingFailure']({
        id: 'event-1', eventType: 'transcript.done',
        payload: { data: { bot: { id: 'stored-bot', metadata: { meetingId: 'owned-meeting' } } } },
      }, new Error(marker));
      expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
      expect(webhookRepo.markProcessed).toHaveBeenCalledWith('event-1');
      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('owned-meeting', 'failed', {
        errorMessage: 'Processing failed after max retries',
      });
    } finally {
      log.mockRestore();
    }
  });

  it.each(['audio_uploaded', 'transcription_ready'])('%s exhaustion retains a claimed upload for provider reconciliation', async eventType => {
    const { worker, meetingRepo, webhookRepo, uploadMeeting } = makeWorker();
    uploadMeeting.uploadSubmissionClaimedAt = new Date(Date.now() - 30 * 60_000);
    uploadMeeting.uploadProviderExcludedAt = null;
    const payload = eventType === 'audio_uploaded'
      ? { meetingId: uploadMeeting.id }
      : { jobId: uploadMeeting.transcriptionJobId };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await worker['handleProcessingFailure']({ id: 'exhausted-upload', eventType, payload },
        new Error('provider outcome unknown'));
      expect(webhookRepo.markProcessed).toHaveBeenCalledWith('exhausted-upload');
      expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('still fails an upload that exhausted retries before provider admission', async () => {
    const { worker, meetingRepo, webhookRepo, uploadMeeting } = makeWorker();
    uploadMeeting.status = 'pending';
    uploadMeeting.uploadSubmissionClaimedAt = null;
    await worker['handleProcessingFailure']({ id: 'pre-provider-failure',
      eventType: 'audio_uploaded', payload: { meetingId: uploadMeeting.id } },
      new Error('signed URL failed'));
    expect(webhookRepo.markProcessed).toHaveBeenCalledWith('pre-provider-failure');
    expect(meetingRepo.updateStatus).toHaveBeenCalledWith(uploadMeeting.id, 'failed', {
      errorMessage: 'Processing failed after max retries',
    });
  });
});
