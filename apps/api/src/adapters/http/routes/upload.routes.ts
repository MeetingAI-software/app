import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { config } from '../../../config/env';
import { logger } from '../../../config/logger';
import type { MeetingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import type { UsageMeterService } from '../../../application/usage-meter.service';
import type { AudioStoragePort } from '../../../ports/audio-storage.port';
import { parseParticipantNames, isAudioMime } from './upload-inputs';
import { perUserRouteLimiter, SPEND_LIMITS } from '../middleware/rate-limit';

/**
 * POST /api/meetings/upload — in-room recording upload.
 * multipart: `audio` file + `participantNames` (JSON array). Reject > MAX_UPLOAD_MB (413) and
 * non-audio MIME (400). The monthly-hours cap protects the wallet on this path too. On success:
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

  router.post('/api/meetings/upload', uploadLimiter, (req, res, next) => {
    upload.single('audio')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: { code: 'FILE_TOO_LARGE', message: `Audio exceeds the ${config.MAX_UPLOAD_MB}MB limit` },
          });
        }
        return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
      }
      if (err) {
        // fileFilter rejection (non-audio) or malformed multipart — a client error either way.
        return res.status(400).json({
          error: { code: 'INVALID_AUDIO', message: err instanceof Error ? err.message : 'Invalid upload' },
        });
      }
      handleUpload(req, res).catch(next);
    });
  });

  async function handleUpload(req: Request, res: Response): Promise<Response> {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { code: 'NO_FILE', message: 'An audio file is required (field "audio")' } });
    }
    // Defensive second gate — never trust a single check for something that costs money downstream.
    if (!isAudioMime(file.mimetype)) {
      return res.status(400).json({ error: { code: 'INVALID_AUDIO', message: 'Only audio uploads are supported' } });
    }

    // Throws ZodError (→ 400) on a malformed participantNames field.
    const participantNames = parseParticipantNames(req.body?.participantNames);

    // Monthly hours protect the wallet on BOTH the bot and the upload path (→ 429), per user.
    await usageMeter.assertCanStartMeeting(req.userId!, 'upload');

    const meeting = await meetingRepo.create({ ownerUserId: req.userId!, source: 'upload', participantNames });

    try {
      const { path } = await storage.upload(meeting.id, file.buffer, file.mimetype);
      await meetingRepo.setUploadInfo(meeting.id, { audioStoragePath: path });
      await webhookRepo.insertIfNew({
        provider: 'upload',
        externalEventId: `audio_uploaded:${meeting.id}`,
        eventType: 'audio_uploaded',
        payload: { meetingId: meeting.id },
      });
    } catch (err) {
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

    logger.info({ meetingId: meeting.id, participants: participantNames.length }, 'In-room audio uploaded');
    return res.status(201).json({ meeting });
  }

  return router;
}
