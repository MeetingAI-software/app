import { describe, expect, it, vi } from 'vitest';
import { WebhookWorker } from './worker';
import type { Meeting } from '../domain/types';
import type { MeetingRepository, WebhookEventRepository } from '../ports/repositories.port';
import type { ProcessWebhookEventService } from '../application/process-webhook-event.service';
import type { ProcessUploadEventService } from '../application/process-upload-event.service';
import type { MeetingBotPort } from '../ports/meeting-bot.port';

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
  } as unknown as MeetingRepository;
  const worker = new WebhookWorker(
    {} as WebhookEventRepository, meetingRepo, {} as ProcessWebhookEventService,
    {} as ProcessUploadEventService, {} as MeetingBotPort,
  );
  return { worker, meetingRepo, botMeeting, uploadMeeting };
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
});
