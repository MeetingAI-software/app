import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { config } from '../../../config/env';
import { logger } from '../../../config/logger';
import type { MeetingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import type { UsageMeterService } from '../../../application/usage-meter.service';
import type { AudioStoragePort } from '../../../ports/audio-storage.port';
import { parseParticipantNames, isAudioMime, detectAudioFormat } from './upload-inputs';
import { perUserRouteLimiter, SPEND_LIMITS } from '../middleware/rate-limit';
import { RECORDING_NOTICE_VERSION } from '../../../domain/recording-notice';

/**
 * POST /api/meetings/upload — in-room recording upload.
 * multipart: `audio` file + `participantNames` (JSON array). Reject > MAX_UPLOAD_MB (413) and
 * anything whose bytes are not a recognised audio container (400). The monthly-hours cap protects
 * the wallet on this path too. On success:
 * create meeting (source:'upload') → storage.upload → setUploadInfo → enqueue `audio_uploaded` → 201.
 */
export function createUploadRoutes(
  meetingRepo: MeetingRepository,
  webhookRepo: WebhookEventRepository,
  usageMeter: UsageMeterService,
  storage: AudioStoragePort
): Router {
  const router = Router();

  // Day 6 §2 spend limit — runs before multer so we reject over-limit uploads before buffering a file.
  const uploadLimiter = perUserRouteLimiter('upload', SPEND_LIMITS.upload);
  let activeUploadBuffers = 0;

  // Header gate runs before multer, so a direct caller cannot consume a large heap buffer without
  // affirming the current participant-notice text. The server, not the client, stamps the time.
  const requireRecordingNotice = (req: Request, res: Response, next: () => void) => {
    if (
      req.headers['x-recording-notice-confirmed'] !== 'true'
      || req.headers['x-recording-notice-version'] !== RECORDING_NOTICE_VERSION
    ) {
      return res.status(400).json({
        error: { code: 'RECORDING_NOTICE_REQUIRED', message: 'Confirm the current recording notice before uploading' },
      });
    }
    next();
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (isAudioMime(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only audio uploads are supported'));
      }
    },
  });

  // The email-verification gate in server.ts runs ahead of both the limiter and multer, so an
  // unverified caller never gets to buffer a MAX_UPLOAD_MB file into heap.
  router.post('/api/meetings/upload', uploadLimiter, requireRecordingNotice, async (req, res, next) => {
    if (activeUploadBuffers >= config.MAX_CONCURRENT_UPLOADS) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({
        error: { code: 'UPLOAD_CAPACITY_REACHED', message: 'Another upload is in progress; please retry shortly' },
      });
    }
    activeUploadBuffers += 1;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => { if (!res.writableFinished) abort(); };
    req.once('aborted', abort);
    res.once('close', close);
    let parsed = false;
    try {
      await new Promise<void>((resolve, reject) => {
        upload.single('audio')(req, res, (err: unknown) => err ? reject(err) : resolve());
      });
      parsed = true;
      controller.signal.throwIfAborted();
      return await handleUpload(req, res, controller.signal);
    } catch (err) {
      if (controller.signal.aborted || res.destroyed) return;
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: { code: 'FILE_TOO_LARGE', message: `Audio exceeds the ${config.MAX_UPLOAD_MB}MB limit` },
          });
        }
        return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
      }
      if (!parsed) {
        // fileFilter rejection (non-audio) or malformed multipart — a client error either way.
        return res.status(400).json({
          error: { code: 'INVALID_AUDIO', message: err instanceof Error ? err.message : 'Invalid upload' },
        });
      }
      return next(err);
    } finally {
      // Response close only signals cancellation. Parser, storage, DB and cleanup retain their
      // reservation until settled, even if an adapter ignores cancellation. Release exactly once.
      delete req.file;
      req.off('aborted', abort);
      res.off('close', close);
      activeUploadBuffers -= 1;
    }
  });

  async function handleUpload(req: Request, res: Response, signal: AbortSignal): Promise<Response> {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { code: 'NO_FILE', message: 'An audio file is required (field "audio")' } });
    }
    // Defensive second gate — never trust a single check for something that costs money downstream.
    if (!isAudioMime(file.mimetype)) {
      return res.status(400).json({ error: { code: 'INVALID_AUDIO', message: 'Only audio uploads are supported' } });
    }
    // The declared type above is the caller's word for it; this is the file's. Runs before the
    // usage meter so a spoofed upload never reaches the (paid) transcription vendor.
    const audio = detectAudioFormat(file.buffer);
    if (!audio) {
      return res.status(400).json({
        error: { code: 'INVALID_AUDIO', message: 'The uploaded file is not a recognised audio recording' },
      });
    }

    // Throws ZodError (→ 400) on a malformed participantNames field.
    const participantNames = parseParticipantNames(req.body?.participantNames);

    // Monthly hours protect the wallet on BOTH the bot and the upload path (→ 429), per user.
    await usageMeter.assertCanStartMeeting(req.userId!, 'upload');
    signal.throwIfAborted();

    const meeting = await meetingRepo.create({
      ownerUserId: req.userId!,
      source: 'upload',
      participantNames,
      recordingNoticeConfirmedAt: new Date(),
      recordingNoticeVersion: RECORDING_NOTICE_VERSION,
    });

    let uploadedPath: string | null = null;
    try {
      signal.throwIfAborted();
      // The detected type, not the declared one — the stored object key is then derived entirely
      // from bytes we verified rather than from a header the caller chose.
      const { path } = await storage.upload(meeting.id, file.buffer, audio.mime, { signal });
      uploadedPath = path;
      signal.throwIfAborted();
      await meetingRepo.setUploadInfo(meeting.id, { audioStoragePath: path });
      signal.throwIfAborted();
      await webhookRepo.insertIfNew({
        provider: 'upload',
        externalEventId: `audio_uploaded:${meeting.id}`,
        eventType: 'audio_uploaded',
        payload: { meetingId: meeting.id },
      });
    } catch (err) {
      // If storage succeeded but the DB/outbox failed, remove the object immediately. The meeting
      // row remains failed for support/audit purposes and the original error still propagates.
      if (uploadedPath) {
        await storage.delete(uploadedPath).catch(() => {
          logger.error({ meetingId: meeting.id }, 'Failed to remove an incomplete upload');
        });
      }
      // Don't leave the row stuck in 'pending' with no audio behind it.
      await meetingRepo
        .updateStatus(meeting.id, 'failed', {
          errorMessage: err instanceof Error ? err.message : 'Upload failed',
        })
        .catch(() => {
          /* best effort — the original error is what matters */
        });
      throw err;
    }

    logger.info(
      { meetingId: meeting.id, participants: participantNames.length, format: audio.format },
      'In-room audio uploaded'
    );
    return res.status(201).json({ meeting });
  }

  return router;
}
