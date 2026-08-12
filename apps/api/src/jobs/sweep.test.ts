import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EMAIL_SEND_LEDGER_RETENTION_MS, SweepJob } from './sweep';
import type { MeetingRepository } from '../ports/repositories.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { Meeting } from '../domain/types';

describe('SweepJob', () => {
  let meetingRepo: any;
  let storage: any;
  let botAdapter: any;
  let sessionRepo: any;
  let emailSendLedgerRepo: any;
  let verificationTokenRepo: any;
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

    sessionRepo = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      deleteByTokenHash: vi.fn(),
      deleteAllForUser: vi.fn(),
      deleteExpired: vi.fn().mockResolvedValue(0),
    };

    emailSendLedgerRepo = {
      countSince: vi.fn(),
      record: vi.fn(),
      deleteOlderThan: vi.fn().mockResolvedValue(0),
    };

    verificationTokenRepo = {
      deleteExpired: vi.fn().mockResolvedValue(0),
    };

    sweepJob = new SweepJob(
      meetingRepo,
      storage,
      botAdapter,
      sessionRepo,
      emailSendLedgerRepo,
      verificationTokenRepo,
    );
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

    it('deletes expired sessions during the sweep while valid ones survive', async () => {
      // Stateful store standing in for the DB: one expired session, one still valid.
      const store = [
        { id: 's-expired', expiresAt: new Date(Date.now() - 1000) },
        { id: 's-valid', expiresAt: new Date(Date.now() + 60_000) },
      ];
      sessionRepo.deleteExpired.mockImplementation(async () => {
        const now = Date.now();
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (store[i].expiresAt.getTime() < now) store.splice(i, 1);
        }
        return before - store.length;
      });

      await sweepJob.runSweep();

      expect(sessionRepo.deleteExpired).toHaveBeenCalled();
      expect(store.map((s) => s.id)).toEqual(['s-valid']); // expired swept, valid survives
    });

    it('keeps meeting cleanup running even if session cleanup throws', async () => {
      sessionRepo.deleteExpired.mockRejectedValue(new Error('session store down'));
      meetingRepo.findTranscribedOlderThan.mockResolvedValue([
        { id: 'm-1', source: 'bot', status: 'transcribed', botId: 'bot-1', audioStoragePath: 'a/1', platform: 'zoom', shareToken: 't', createdAt: new Date(), updatedAt: new Date() } as any,
      ]);

      await expect(sweepJob.runSweep()).resolves.toBeUndefined();
      expect(storage.delete).toHaveBeenCalledWith('a/1'); // the rest of the sweep still ran
    });

    it('deletes expired verification tokens while preserving valid tokens', async () => {
      const now = Date.now();
      const store = [
        { id: 'v-expired', expiresAt: new Date(now - 1000) },
        { id: 'v-valid', expiresAt: new Date(now + 60_000) },
      ];
      verificationTokenRepo.deleteExpired.mockImplementation(async (cutoff: Date) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (store[i].expiresAt.getTime() <= cutoff.getTime()) store.splice(i, 1);
        }
        return before - store.length;
      });

      await sweepJob.runSweep();

      expect(verificationTokenRepo.deleteExpired).toHaveBeenCalledWith(expect.any(Date));
      expect(store.map((token) => token.id)).toEqual(['v-valid']);
    });

    it('keeps meeting cleanup running if verification token cleanup throws', async () => {
      verificationTokenRepo.deleteExpired.mockRejectedValue(new Error('verification store down'));
      meetingRepo.findTranscribedOlderThan.mockResolvedValue([
        { id: 'm-token', source: 'bot', status: 'transcribed', botId: 'bot-token', audioStoragePath: 'a/token', platform: 'zoom', shareToken: 't', createdAt: new Date(), updatedAt: new Date() } as any,
      ]);

      await expect(sweepJob.runSweep()).resolves.toBeUndefined();
      expect(storage.delete).toHaveBeenCalledWith('a/token');
    });

    it('prunes email send ledger rows past the retention window', async () => {
      // Stateful store standing in for the DB: one row inside retention, one long past it.
      const store = [
        { id: 'l-old', createdAt: new Date(Date.now() - EMAIL_SEND_LEDGER_RETENTION_MS - 1000) },
        { id: 'l-recent', createdAt: new Date(Date.now() - 60_000) },
      ];
      emailSendLedgerRepo.deleteOlderThan.mockImplementation(async (cutoff: Date) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (store[i].createdAt.getTime() < cutoff.getTime()) store.splice(i, 1);
        }
        return before - store.length;
      });

      await sweepJob.runSweep();

      expect(emailSendLedgerRepo.deleteOlderThan).toHaveBeenCalled();
      expect(store.map((row) => row.id)).toEqual(['l-recent']);
    });

    it('keeps meeting cleanup running even if ledger cleanup throws', async () => {
      emailSendLedgerRepo.deleteOlderThan.mockRejectedValue(new Error('ledger store down'));
      meetingRepo.findTranscribedOlderThan.mockResolvedValue([
        { id: 'm-2', source: 'bot', status: 'transcribed', botId: 'bot-2', audioStoragePath: 'a/2', platform: 'zoom', shareToken: 't', createdAt: new Date(), updatedAt: new Date() } as any,
      ]);

      await expect(sweepJob.runSweep()).resolves.toBeUndefined();
      expect(storage.delete).toHaveBeenCalledWith('a/2');
    });

  });
});
