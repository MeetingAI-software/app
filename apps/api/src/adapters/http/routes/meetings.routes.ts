import { Router } from 'express';
import { z } from 'zod';
import type { MeetingRepository, TranscriptRepository } from '../../../ports/repositories.port';
import type { StartMeetingService } from '../../../application/start-meeting.service';

export function createMeetingRoutes(
  meetingRepo: MeetingRepository,
  transcriptRepo: TranscriptRepository,
  startMeetingService: StartMeetingService
): Router {
  const router = Router();

  const createMeetingSchema = z.object({
    meetingUrl: z.string().url().refine(val => val.includes('zoom.us'), {
      message: 'Only Zoom meetings (zoom.us) are supported',
    }),
  });

  // POST /api/meetings
  router.post('/api/meetings', async (req, res, next) => {
    try {
      const parsed = createMeetingSchema.parse(req.body);
      const meeting = await startMeetingService.start(parsed.meetingUrl);
      return res.status(201).json(meeting);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings
  router.get('/api/meetings', async (req, res, next) => {
    try {
      const list = await meetingRepo.list();
      return res.status(200).json(list);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id
  router.get('/api/meetings/:id', async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findById(req.params.id);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      }
      return res.status(200).json(meeting);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id/transcript
  router.get('/api/meetings/:id/transcript', async (req, res, next) => {
    try {
      const transcript = await transcriptRepo.getByMeetingId(req.params.id);
      if (!transcript) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transcript not found' } });
      }
      return res.status(200).json(transcript);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
