import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessUploadEventService } from './process-upload-event.service';
import type {
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { TranscriptionPort } from '../ports/transcription.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import type { Meeting, MeetingStatus, TranscriptSegment } from '../domain/types';
import { TranscriptionSubmitRejectedError } from '../domain/errors';
import { logger } from '../config/logger';

const DIARIZED: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Speaker A', text: 'Kicking off the in-room sync.' },
  { startMs: 2500, endMs: 31000, speaker: 'Speaker B', text: 'Upload path works end to end.' },
];

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: null,
    platform: 'zoom',
    status: 'processing' as MeetingStatus,
    source: 'upload',
    botId: null,
    ownerUserId: 'u1',
    durationSeconds: null,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    shareEnabled: true,
    participantNames: ['Alper', 'AbdulRehman'],
    audioStoragePath: 'm1/audio.webm',
    transcriptionJobId: null,
    createdAt: new Date('2026-07-18T10:00:00Z'),
    updatedAt: new Date('2026-07-18T10:00:00Z'),
    ...overrides,
  };
}

describe('ProcessUploadEventService', () => {
  let meetingRepo: MeetingRepository;
  let transcriptRepo: TranscriptRepository;
  let usageRepo: UsageRepository;
  let transcription: TranscriptionPort;
  let storage: AudioStoragePort;
  let docGen: DocumentGeneratorPort;
  let service: ProcessUploadEventService;

  beforeEach(() => {
    meetingRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByBotId: vi.fn(),
      findByShareToken: vi.fn(),
      enableShare: vi.fn(),
      revokeShare: vi.fn(),
      findByTranscriptionJobId: vi.fn(),
      claimUploadSubmission: vi.fn().mockResolvedValue(true),
      bindTranscriptionJob: vi.fn().mockResolvedValue(true),
      failRejectedUploadSubmission: vi.fn(),
      updateStatus: vi.fn(),
      setSummary: vi.fn(),
      setUploadInfo: vi.fn(),
      countActive: vi.fn(),
      reserve: vi.fn(), countActiveForUser: vi.fn(),
      list: vi.fn(),
      findByIdForUser: vi.fn(),
      listForUser: vi.fn(),
      deleteById: vi.fn(),
      setShareEnabled: vi.fn(),
      rotateShareToken: vi.fn(),
    };
    transcriptRepo = { save: vi.fn(), getByMeetingId: vi.fn(), deleteByMeeting: vi.fn() };
    usageRepo = { addSeconds: vi.fn(), monthlyTotalSeconds: vi.fn(), deleteByMeeting: vi.fn() };
    transcription = { submit: vi.fn(), fetchResult: vi.fn() };
    storage = { upload: vi.fn(), getSignedUrl: vi.fn(), delete: vi.fn() };
    docGen = { generateDocument: vi.fn(), generateSummary: vi.fn() };
    service = new ProcessUploadEventService(meetingRepo, transcriptRepo, usageRepo, transcription, storage, docGen);
  });

  describe('audio_uploaded', () => {
    it('moves pending → processing, submits a signed URL, and stores the job id', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'pending' }));
      vi.mocked(storage.getSignedUrl).mockResolvedValue('https://signed/audio.webm');
      vi.mocked(transcription.submit).mockResolvedValue({ jobId: 'job-1' });

      await service.process('audio_uploaded', { meetingId: 'm1' });

      expect(meetingRepo.claimUploadSubmission).toHaveBeenCalledWith('m1');
      expect(storage.getSignedUrl).toHaveBeenCalledWith('m1/audio.webm');
      expect(transcription.submit).toHaveBeenCalledWith('https://signed/audio.webm', { meetingId: 'm1' });
      expect(meetingRepo.bindTranscriptionJob).toHaveBeenCalledWith('m1', 'job-1');
    });

    it('throws when the meeting is missing', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(null);
      await expect(service.process('audio_uploaded', { meetingId: 'nope' })).rejects.toThrow(/not found/);
    });

    it('throws when the meeting has no audio path', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ audioStoragePath: null }));
      await expect(service.process('audio_uploaded', { meetingId: 'm1' })).rejects.toThrow(/no audioStoragePath/);
    });

    it('is idempotent: does not re-submit when a job id already exists', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'processing', transcriptionJobId: 'job-1' }));

      await service.process('audio_uploaded', { meetingId: 'm1' });

      expect(transcription.submit).not.toHaveBeenCalled();
      expect(meetingRepo.claimUploadSubmission).not.toHaveBeenCalled();
    });

    it('does not repeat an ambiguous paid submit on worker replay', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValueOnce(meeting({ status: 'pending' }))
        .mockResolvedValueOnce(meeting({ status: 'processing' }));
      vi.mocked(storage.getSignedUrl).mockResolvedValue('https://signed/audio.webm');
      vi.mocked(meetingRepo.claimUploadSubmission).mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      vi.mocked(transcription.submit).mockRejectedValueOnce(new Error('unknown provider outcome'));

      await expect(service.process('audio_uploaded', { meetingId: 'm1' }))
        .rejects.toThrow('unknown provider outcome');
      await service.process('audio_uploaded', { meetingId: 'm1' });

      expect(transcription.submit).toHaveBeenCalledTimes(1);
      expect(meetingRepo.bindTranscriptionJob).not.toHaveBeenCalled();
    });

    it('does not submit if the stored meeting is already failed', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'failed' }));
      vi.mocked(storage.getSignedUrl).mockResolvedValue('https://signed/audio.webm');
      vi.mocked(meetingRepo.claimUploadSubmission).mockResolvedValue(false);

      await service.process('audio_uploaded', { meetingId: 'm1' });
      expect(transcription.submit).not.toHaveBeenCalled();
    });

    it('fails and releases a definitely rejected submission', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'pending' }));
      vi.mocked(storage.getSignedUrl).mockResolvedValue('https://signed/audio.webm');
      vi.mocked(transcription.submit).mockRejectedValue(
        new TranscriptionSubmitRejectedError('AssemblyAI submit rejected: 401'));

      await service.process('audio_uploaded', { meetingId: 'm1' });

      expect(meetingRepo.failRejectedUploadSubmission)
        .toHaveBeenCalledWith('m1', 'Transcription request rejected');
      expect(meetingRepo.bindTranscriptionJob).not.toHaveBeenCalled();
    });
  });

  describe('transcription_ready', () => {
    beforeEach(() => {
      vi.mocked(transcription.fetchResult).mockResolvedValue(DIARIZED.map((s) => ({ ...s })));
      vi.mocked(docGen.generateSummary).mockResolvedValue('A short summary.');
    });

    it('maps speakers, saves the transcript, marks transcribed, records usage, summarizes, and deletes audio', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting());

      await service.process('transcription_ready', { jobId: 'job-1', meetingId: 'm1' });

      const savedSegments = vi.mocked(transcriptRepo.save).mock.calls[0][1] as TranscriptSegment[];
      expect(savedSegments.map((s) => s.speaker)).toEqual(['Alper', 'AbdulRehman']);
      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'transcribed', { durationSeconds: 31 });
      expect(usageRepo.addSeconds).toHaveBeenCalledWith('m1', 31);
      expect(meetingRepo.setSummary).toHaveBeenCalledWith('m1', 'A short summary.');
      expect(storage.delete).toHaveBeenCalledWith('m1/audio.webm');
    });

    it('resolves the meeting by job id when the payload has no meetingId (real webhook path)', async () => {
      vi.mocked(meetingRepo.findByTranscriptionJobId).mockResolvedValue(meeting());

      await service.process('transcription_ready', { jobId: 'job-1' });

      expect(meetingRepo.findByTranscriptionJobId).toHaveBeenCalledWith('job-1');
      expect(meetingRepo.findById).not.toHaveBeenCalled();
      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'transcribed', { durationSeconds: 31 });
    });

    it('does NOT delete the audio when the summary fails (GDPR: delete only after summary success)', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting());
      const marker = 'PRIVATE-MEETING-SPEECH-and-bearer-token';
      vi.mocked(docGen.generateSummary).mockRejectedValue(new Error(marker));
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);

      try {
        await service.process('transcription_ready', { jobId: 'job-1', meetingId: 'm1' });
        expect(JSON.stringify([warn.mock.calls, error.mock.calls])).not.toContain(marker);
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }

      expect(meetingRepo.setSummary).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      // ...but the transcript and status still land.
      expect(transcriptRepo.save).toHaveBeenCalled();
      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'transcribed', { durationSeconds: 31 });
    });

    it('treats a storage.delete failure as non-fatal', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting());
      vi.mocked(storage.delete).mockRejectedValue(new Error('storage unreachable'));

      await expect(service.process('transcription_ready', { jobId: 'job-1', meetingId: 'm1' })).resolves.toBeUndefined();
      expect(meetingRepo.setSummary).toHaveBeenCalled();
    });

    it('is idempotent: a replayed webhook on a transcribed meeting does nothing', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ status: 'transcribed' }));

      await service.process('transcription_ready', { jobId: 'job-1', meetingId: 'm1' });

      expect(transcription.fetchResult).not.toHaveBeenCalled();
      expect(transcriptRepo.save).not.toHaveBeenCalled();
    });

    it('throws when no meeting can be found for the job', async () => {
      vi.mocked(meetingRepo.findByTranscriptionJobId).mockResolvedValue(null);
      await expect(service.process('transcription_ready', { jobId: 'ghost' })).rejects.toThrow(/not found/);
    });

    it('leaves speakers generic when no participant names were entered', async () => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meeting({ participantNames: null }));

      await service.process('transcription_ready', { jobId: 'job-1', meetingId: 'm1' });

      const savedSegments = vi.mocked(transcriptRepo.save).mock.calls[0][1] as TranscriptSegment[];
      expect(savedSegments.map((s) => s.speaker)).toEqual(['Speaker A', 'Speaker B']);
    });
  });
});
