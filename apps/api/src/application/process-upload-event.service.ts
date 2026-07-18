import type {
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { TranscriptionPort } from '../ports/transcription.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import type { TranscriptSegment } from '../domain/types';
import { assertTransition } from '../domain/state-machine';
import { mapSpeakers } from '../domain/speaker-mapping';
import { logger } from '../config/logger';

export type UploadEventType = 'audio_uploaded' | 'transcription_ready';

/**
 * The worker side of the in-room upload pipeline (Architecture-Day3 §7). Two events:
 *  - `audio_uploaded`      → pending → processing → submit the audio to the transcription vendor.
 *  - `transcription_ready` → fetch result → map speakers → save → transcribed → usage → summary →
 *                            delete the audio (same GDPR rule as the bot path).
 * The worker owns retries/backoff; this service just does the work and throws on failure.
 */
export class ProcessUploadEventService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly transcriptRepo: TranscriptRepository,
    private readonly usageRepo: UsageRepository,
    private readonly transcription: TranscriptionPort,
    private readonly storage: AudioStoragePort,
    private readonly docGen: DocumentGeneratorPort
  ) {}

  async process(eventType: UploadEventType, payload: unknown): Promise<void> {
    const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as {
      meetingId?: string;
      jobId?: string;
    };

    if (eventType === 'audio_uploaded') {
      await this.handleAudioUploaded(parsed);
    } else {
      await this.handleTranscriptionReady(parsed, payload);
    }
  }

  /** pending → processing → submit to the vendor. Fast: it does not wait for the transcript. */
  private async handleAudioUploaded(payload: { meetingId?: string }): Promise<void> {
    if (!payload.meetingId) throw new Error('audio_uploaded payload missing meetingId');

    const meeting = await this.meetingRepo.findById(payload.meetingId);
    if (!meeting) throw new Error(`Meeting not found: ${payload.meetingId}`);
    if (!meeting.audioStoragePath) throw new Error(`Meeting ${meeting.id} has no audioStoragePath`);

    // Idempotent: if we already submitted, do not create a second transcription job.
    if (meeting.transcriptionJobId) {
      logger.info({ meetingId: meeting.id }, 'audio_uploaded already submitted — skipping');
      return;
    }

    if (meeting.status === 'pending') {
      assertTransition('pending', 'processing');
      await this.meetingRepo.updateStatus(meeting.id, 'processing');
    }

    const url = await this.storage.getSignedUrl(meeting.audioStoragePath);
    const { jobId } = await this.transcription.submit(url, { meetingId: meeting.id });
    await this.meetingRepo.setUploadInfo(meeting.id, { transcriptionJobId: jobId });

    logger.info({ meetingId: meeting.id, jobId }, 'Transcription submitted for uploaded audio');
  }

  /** Fetch result → map speakers → save → transcribed → usage → summary → GDPR delete. */
  private async handleTranscriptionReady(
    payload: { meetingId?: string; jobId?: string },
    rawPayload: unknown
  ): Promise<void> {
    const jobId = payload.jobId;
    if (!jobId) throw new Error('transcription_ready payload missing jobId');

    // Fake path carries meetingId; the real AssemblyAI webhook only knows the transcript id.
    let meeting = payload.meetingId ? await this.meetingRepo.findById(payload.meetingId) : null;
    if (!meeting) meeting = await this.meetingRepo.findByTranscriptionJobId(jobId);
    if (!meeting) throw new Error(`Meeting not found for jobId ${jobId}`);

    // Idempotent: a replayed webhook must not produce a second transcript.
    if (meeting.status === 'transcribed') {
      logger.info({ meetingId: meeting.id }, 'transcription_ready for an already-transcribed meeting — skipping');
      return;
    }

    let segments = await this.transcription.fetchResult(jobId);
    segments = mapSpeakers(segments, meeting.participantNames ?? []);

    await this.transcriptRepo.save(meeting.id, segments, rawPayload);

    const durationSeconds = segments.length
      ? Math.ceil(Math.max(...segments.map((s) => s.endMs)) / 1000)
      : 0;

    // Upload path arrives here as 'processing'. Nudge from 'pending' if the events raced.
    let currentStatus = meeting.status;
    if (currentStatus === 'pending') {
      assertTransition('pending', 'processing');
      await this.meetingRepo.updateStatus(meeting.id, 'processing');
      currentStatus = 'processing';
    }
    assertTransition(currentStatus, 'transcribed');
    await this.meetingRepo.updateStatus(meeting.id, 'transcribed', { durationSeconds });

    // Uploads cost transcription money too.
    await this.usageRepo.addSeconds(meeting.id, durationSeconds);

    // Summary — a missing summary must never block completion or the document button.
    let summarySucceeded = false;
    try {
      const summary = await this.generateSummaryWithRetry(segments);
      await this.meetingRepo.setSummary(meeting.id, summary);
      summarySucceeded = true;
      logger.info({ meetingId: meeting.id }, 'Summary generated (upload)');
    } catch (err) {
      logger.error(
        { meetingId: meeting.id, err: err instanceof Error ? err.message : String(err) },
        'Summary generation failed after retry — leaving summary null and continuing'
      );
    }

    // GDPR: delete the audio ONLY after the summary proved the pipeline could read it. The
    // transcript is the source of truth from here. Deletion failure is non-fatal by design.
    if (summarySucceeded && meeting.audioStoragePath) {
      try {
        await this.storage.delete(meeting.audioStoragePath);
        logger.info({ meetingId: meeting.id }, 'Uploaded audio deleted from storage');
      } catch (err) {
        logger.warn(
          { meetingId: meeting.id, err: err instanceof Error ? err.message : String(err) },
          'Failed to delete uploaded audio — a sweep can retry'
        );
      }
    }
  }

  /** One retry. A thrown error means "leave summary null and carry on" (same as the bot path). */
  private async generateSummaryWithRetry(segments: TranscriptSegment[]): Promise<string> {
    try {
      return await this.docGen.generateSummary(segments);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Summary failed, retrying once');
      return await this.docGen.generateSummary(segments);
    }
  }
}
