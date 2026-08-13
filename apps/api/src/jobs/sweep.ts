import type {
  EmailSendLedgerRepository,
  MeetingRepository,
  SessionRepository,
  VerificationTokenRepository,
} from '../ports/repositories.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import { assertTransition } from '../domain/state-machine';
import { logger } from '../config/logger';
import { captureError } from '../adapters/observability/sentry';

/**
 * How long spent-email records are kept. Long enough to investigate an abuse incident and to
 * sanity-check volume against the monthly provider cap; the budget itself only ever reads 24h.
 */
export const EMAIL_SEND_LEDGER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class SweepJob {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly storage: AudioStoragePort,
    private readonly botAdapter: MeetingBotPort,
    private readonly sessionRepo: SessionRepository,
    private readonly emailSendLedgerRepo: EmailSendLedgerRepository,
    private readonly verificationTokenRepo: VerificationTokenRepository,
  ) {}

  start() {
    // Run on boot asynchronously
    this.runSweep().catch(err => {
      logger.error({ err }, 'Sweep job boot run failed');
    });

    // Run every 6 hours
    this.intervalId = setInterval(() => {
      this.runSweep().catch(err => {
        logger.error({ err }, 'Sweep job interval run failed');
      });
    }, 6 * 60 * 60 * 1000);
    logger.info('Sweep job scheduled to run every 6 hours');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runSweep(): Promise<void> {
    logger.info('Sweep job started');

    // 1. Clean up transcribed meetings older than 1 hour
    try {
      const oldTranscribed = await this.meetingRepo.findTranscribedOlderThan!(1);
      logger.info({ count: oldTranscribed.length }, 'Sweep found old transcribed meetings');
      for (const meeting of oldTranscribed) {
        try {
          // Clean up Supabase storage
          if (meeting.audioStoragePath) {
            logger.info({ meetingId: meeting.id, path: meeting.audioStoragePath }, 'Deleting audio from storage');
            await this.storage.delete(meeting.audioStoragePath);
            await this.meetingRepo.setUploadInfo(meeting.id, { audioStoragePath: null });
            logger.info({ meetingId: meeting.id }, 'Cleared meeting audioStoragePath in DB');
          }

          // Clean up Recall recording
          if (meeting.source === 'bot' && meeting.botId) {
            logger.info({ meetingId: meeting.id, botId: meeting.botId }, 'Deleting Recall bot recording');
            await this.botAdapter.deleteRecording(meeting.botId);
            logger.info({ meetingId: meeting.id }, 'Recall bot recording deletion request complete');
          }
        } catch (mErr: any) {
          logger.error({ err: mErr, meetingId: meeting.id }, 'Failed to clean up transcribed meeting');
          captureError(mErr, { meetingId: meeting.id });
        }
      }
    } catch (err: any) {
      logger.error({ err }, 'Error cleaning up old transcribed meetings');
      captureError(err);
    }

    // 2. Clean up stuck active meetings older than 15 minutes
    try {
      const stuckMeetings = await this.meetingRepo.findStuckActiveOlderThan!(15);
      logger.info({ count: stuckMeetings.length }, 'Sweep found stuck active meetings');
      for (const meeting of stuckMeetings) {
        try {
          if (meeting.botId) {
            const botStatus = await this.botAdapter.getBotStatus(meeting.botId);
            logger.info({ meetingId: meeting.id, botId: meeting.botId, botStatus }, 'Checking stuck bot status');

            if (botStatus === 'joining') {
              assertTransition(meeting.status, 'failed');
              await this.meetingRepo.updateStatus(meeting.id, 'failed', {
                errorMessage: 'Sweep: Bot stuck in joining state for over 15 minutes',
              });
            } else if (botStatus === 'in_call') {
              if (meeting.status === 'bot_joining') {
                assertTransition(meeting.status, 'recording');
                await this.meetingRepo.updateStatus(meeting.id, 'recording');
                logger.info({ meetingId: meeting.id }, 'Repaired stuck status to recording');
              }
            } else if (botStatus === 'done') {
              assertTransition(meeting.status, 'failed');
              await this.meetingRepo.updateStatus(meeting.id, 'failed', {
                errorMessage: 'Sweep: Bot finished but meeting was stuck in active state',
              });
            } else if (botStatus === 'fatal') {
              assertTransition(meeting.status, 'failed');
              await this.meetingRepo.updateStatus(meeting.id, 'failed', {
                errorMessage: 'Sweep: Bot provider reported fatal status',
              });
            }
          } else {
            // Stuck active meeting without botId (e.g., upload stuck in processing, or bot creation failed)
            assertTransition(meeting.status, 'failed');
            const msg = meeting.source === 'upload'
              ? 'Sweep: Upload processing timed out after 15 minutes'
              : 'Sweep: Bot meeting stuck without botId for over 15 minutes';
            await this.meetingRepo.updateStatus(meeting.id, 'failed', {
              errorMessage: msg,
            });
            logger.info({ meetingId: meeting.id }, 'Failed stuck meeting with no botId');
          }
        } catch (mErr: any) {
          logger.error({ err: mErr, meetingId: meeting.id }, 'Failed to reconcile stuck meeting');
          captureError(mErr, { meetingId: meeting.id });
        }
      }
    } catch (err: any) {
      logger.error({ err }, 'Error reconciling stuck active meetings');
      captureError(err);
    }

    // 3. Delete expired sessions (Day 6 §2) — dead credentials shouldn't outlive their usefulness,
    // even hashed. Own try/catch so a session-store hiccup never blocks meeting/audio cleanup.
    try {
      const removed = await this.sessionRepo.deleteExpired();
      logger.info({ count: removed }, 'Sweep deleted expired sessions');
    } catch (err: any) {
      logger.error({ err }, 'Error deleting expired sessions');
      captureError(err);
    }

    // 4. Delete expired email verification credentials. Log only the count: token values and hashes
    // are credentials and must never become retention telemetry.
    try {
      const removed = await this.verificationTokenRepo.deleteExpired(new Date());
      logger.info({ count: removed }, 'Sweep deleted expired email verification tokens');
    } catch (err: any) {
      logger.error({ err }, 'Error deleting expired email verification tokens');
      captureError(err);
    }

    // 5. Prune the email send ledger. Same isolation rule as above: the budget only ever reads the
    // last 24h, so a failure here costs disk, never enforcement.
    try {
      const cutoff = new Date(Date.now() - EMAIL_SEND_LEDGER_RETENTION_MS);
      const removed = await this.emailSendLedgerRepo.deleteOlderThan(cutoff);
      logger.info({ count: removed }, 'Sweep pruned the email send ledger');
    } catch (err: any) {
      logger.error({ err }, 'Error pruning the email send ledger');
      captureError(err);
    }

    logger.info('Sweep job completed');
  }
}
