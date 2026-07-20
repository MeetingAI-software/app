import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SweepJob } from './sweep';
import type { MeetingRepository } from '../ports/repositories.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { Meeting } from '../domain/types';

describe('SweepJob', () => {
  let meetingRepo: any;
  let storage: any;
  let botAdapter: any;
  let sweepJob: SweepJob;

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
      findTranscribedOlderThan: vi.fn().mockResolvedValue([]),
      findStuckActiveOlderThan: vi.fn().mockResolvedValue([]),
    } as any;

    storage = {
      upload: vi.fn(),
      getSignedUrl: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    botAdapter = {
      createBot: vi.fn(),
      getBotStatus: vi.fn(),
      fetchTranscript: vi.fn(),
      deleteRecording: vi.fn().mockResolvedValue(undefined),
    };

    sweepJob = new SweepJob(meetingRepo, storage, botAdapter);
  });

  describe('runSweep', () => {
    it('should delete audio storage and bot recording for transcribed meetings older than 1 hour', async () => {
      const mockMeetings: Meeting[] = [
        {
          id: 'meeting-1',
          source: 'bot',
          status: 'transcribed',
          botId: 'bot-1',
          audioStoragePath: 'audio/path-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          platform: 'zoom',
          shareToken: 'token-1',
        } as any,
      ];

      meetingRepo.findTranscribedOlderThan.mockResolvedValue(mockMeetings);

      await sweepJob.runSweep();

      expect(meetingRepo.findTranscribedOlderThan).toHaveBeenCalledWith(1);
      expect(storage.delete).toHaveBeenCalledWith('audio/path-1');
      expect(meetingRepo.setUploadInfo).toHaveBeenCalledWith('meeting-1', { audioStoragePath: null });
      expect(botAdapter.deleteRecording).toHaveBeenCalledWith('bot-1');
    });

    it('should fail stuck active meetings older than 15 minutes when bot status is joining or done', async () => {
      const mockMeetings: Meeting[] = [
        {
          id: 'meeting-2',
          source: 'bot',
          status: 'bot_joining',
          botId: 'bot-2',
          createdAt: new Date(),
          updatedAt: new Date(),
          platform: 'zoom',
          shareToken: 'token-2',
        } as any,
      ];

      meetingRepo.findStuckActiveOlderThan.mockResolvedValue(mockMeetings);
      botAdapter.getBotStatus.mockResolvedValue('joining');

      await sweepJob.runSweep();

      expect(meetingRepo.findStuckActiveOlderThan).toHaveBeenCalledWith(15);
      expect(botAdapter.getBotStatus).toHaveBeenCalledWith('bot-2');
      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('meeting-2', 'failed', {
        errorMessage: 'Sweep: Bot stuck in joining state for over 15 minutes',
      });
    });

    it('should transition to recording if bot is in call', async () => {
      const mockMeetings: Meeting[] = [
        {
          id: 'meeting-3',
          source: 'bot',
          status: 'bot_joining',
          botId: 'bot-3',
          createdAt: new Date(),
          updatedAt: new Date(),
          platform: 'zoom',
          shareToken: 'token-3',
        } as any,
      ];

      meetingRepo.findStuckActiveOlderThan.mockResolvedValue(mockMeetings);
      botAdapter.getBotStatus.mockResolvedValue('in_call');

      await sweepJob.runSweep();

      expect(meetingRepo.updateStatus).toHaveBeenCalledWith('meeting-3', 'recording');
    });
  });
});
