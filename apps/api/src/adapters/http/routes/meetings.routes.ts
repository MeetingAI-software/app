import { Router } from 'express';
import { z } from 'zod';
import type { MeetingRepository, TranscriptRepository, DocumentRepository } from '../../../ports/repositories.port';
import type { StartMeetingService } from '../../../application/start-meeting.service';
import type { DocumentGeneratorPort } from '../../../ports/document-generator.port';
import { documentContentSchema } from '../../../domain/document.schema';
import { MeetingNotReadyError, DocumentGenerationError } from '../../../domain/errors';

export function createMeetingRoutes(
  meetingRepo: MeetingRepository,
  transcriptRepo: TranscriptRepository,
  documentRepo: DocumentRepository,
  startMeetingService: StartMeetingService,
  documentGenerator: DocumentGeneratorPort
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

  // POST /api/meetings/:id/document
  router.post('/api/meetings/:id/document', async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findById(req.params.id);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      }

      if (meeting.status !== 'transcribed') {
        throw new MeetingNotReadyError('Meeting is not transcribed yet');
      }

      const existingDoc = await documentRepo.getByMeetingId(meeting.id);
      const regenerate = req.query.regenerate === 'true';

      if (existingDoc && !regenerate) {
        return res.status(200).json({ document: existingDoc });
      }

      const segments = await transcriptRepo.getByMeetingId(meeting.id);
      if (!segments || segments.length === 0) {
        throw new MeetingNotReadyError('No transcript segments found for the meeting');
      }

      const meetingIsoDate = meeting.createdAt.toISOString().split('T')[0];
      
      let generated;
      try {
        generated = await documentGenerator.generateDocument(segments, { meetingIsoDate });
      } catch (err: any) {
        throw new DocumentGenerationError(`Failed to generate document: ${err.message}`);
      }

      // Zod gate
      const validatedContent = documentContentSchema.parse(generated.content);

      await documentRepo.upsertForMeeting(meeting.id, validatedContent, {
        model: generated.model,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
      });

      const savedDoc = await documentRepo.getByMeetingId(meeting.id);
      return res.status(201).json({ document: savedDoc });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id/document
  router.get('/api/meetings/:id/document', async (req, res, next) => {
    try {
      const doc = await documentRepo.getByMeetingId(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      }
      return res.status(200).json(doc);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/share/:token (PUBLIC, no auth)
  router.get('/api/share/:token', async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findByShareToken(req.params.token);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown share token' } });
      }

      const transcript = await transcriptRepo.getByMeetingId(meeting.id);
      const document = await documentRepo.getByMeetingId(meeting.id);

      return res.status(200).json({
        meeting: {
          status: meeting.status,
          createdAt: meeting.createdAt,
          durationSeconds: meeting.durationSeconds,
          summary: meeting.summary,
          shareToken: meeting.shareToken,
        },
        document,
        transcript: transcript || [],
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

