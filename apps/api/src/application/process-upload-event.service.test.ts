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
    durationSeconds: null,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
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
      findByTranscriptionJobId: vi.fn(),
      updateStatus: vi.fn(),
      setSummary: vi.fn(),
      setUploadInfo: vi.fn(),
      countActive: vi.fn(),
      list: vi.fn(),
    };
    transcriptRepo = { save: vi.fn(), getByMeetingId: vi.fn() };
    usageRepo = { addSeconds: vi.fn(), monthlyTotalSeconds: vi.fn() };
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

      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('m1', 'processing');
      expect(storage.getSignedUrl).toHaveBeenCalledWith('m1/audio.webm');
      expect(transcription.submit).toHaveBeenCalledWith('https://signed/audio.webm', { meetingId: 'm1' });
      expect(meetingRepo.setUploadInfo).toHaveBeenCalledWith('m1', { transcriptionJobId: 'job-1' });
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
      expect(meetingRepo.updateStatus).not.toHaveBeenCalled();
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
      vi.mocked(docGen.generateSummary).mockRejectedValue(new Error('claude down'));

      await service.process('transcription_ready', { jobId: 'job-1', meetingId: 'm1' });

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
