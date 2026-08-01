import { Router } from 'express';
import { z } from 'zod';
import type {
  MeetingRepository,
  TranscriptRepository,
  DocumentRepository,
  LiveTranscriptRepository,
} from '../../../ports/repositories.port';
import type { StartMeetingService } from '../../../application/start-meeting.service';
import type { LiveTranscriptBus } from '../../realtime/live-transcript.bus';
import type { DocumentGeneratorPort } from '../../../ports/document-generator.port';
import { documentContentSchema } from '../../../domain/document.schema';
import { MeetingNotReadyError, DocumentGenerationError } from '../../../domain/errors';
import { detectPlatform, SUPPORTED_PLATFORMS_MESSAGE } from '../../../domain/meeting-platform';
import { toShareResponse } from './share-response';
import { perUserRouteLimiter, SPEND_LIMITS } from '../middleware/rate-limit';

export function createMeetingRoutes(
  meetingRepo: MeetingRepository,
  transcriptRepo: TranscriptRepository,
  documentRepo: DocumentRepository,
  startMeetingService: StartMeetingService,
  documentGenerator: DocumentGeneratorPort,
  liveRepo?: LiveTranscriptRepository,
  liveBus?: LiveTranscriptBus,
): Router {
  const router = Router();

  // Day 6 §2 spend limits (created once; each holds its own per-user window).
  const createLimiter = perUserRouteLimiter('meeting-create', SPEND_LIMITS.meetingCreate);
  const documentLimiter = perUserRouteLimiter('document', SPEND_LIMITS.document);

  const createMeetingSchema = z.object({
    meetingUrl: z.string().url().refine(val => detectPlatform(val) !== null, {
      message: SUPPORTED_PLATFORMS_MESSAGE,
    }),
  });

  // POST /api/meetings
  router.post('/api/meetings', createLimiter, async (req, res, next) => {
    try {
      const parsed = createMeetingSchema.parse(req.body);
      const meeting = await startMeetingService.start(req.userId!, parsed.meetingUrl);
      return res.status(201).json(meeting);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings
  router.get('/api/meetings', async (req, res, next) => {
    try {
      const list = await meetingRepo.listForUser(req.userId!);
      return res.status(200).json(list);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id
  router.get('/api/meetings/:id', async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
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
      const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      }
      const transcript = await transcriptRepo.getByMeetingId(req.params.id);
      if (!transcript) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transcript not found' } });
      }
      return res.status(200).json(transcript);
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id/live/stream — Server-Sent Events, one connection per open meeting page.
  //
  // Registered before the plain /live route only for readability; Express matches on the full
  // path so the order is not load-bearing.
  router.get('/api/meetings/:id/live/stream', async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      }
      if (!liveRepo || !liveBus) {
        return res.status(503).json({ error: { code: 'LIVE_UNAVAILABLE', message: 'Live transcript is not enabled' } });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        // `no-transform` matters as much as `no-cache`: a proxy that "helpfully" buffers or
        // compresses the stream turns a live transcript into a batch delivered at the end.
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      // Nagle would hold back the small frames that make this feel live.
      res.socket?.setNoDelay(true);

      const send = (event: string, data: unknown, id?: number) => {
        if (res.writableEnded) return;
        const idLine = id !== undefined ? `id: ${id}\n` : '';
        res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Replay anything the client missed. EventSource resends the last id it saw as
      // `Last-Event-ID` on every automatic reconnect, so a dropped connection self-heals with
      // no gap and no duplicates. `?after=` covers the polling client and a fresh page load.
      const lastEventId = Number(req.headers['last-event-id'] ?? req.query.after ?? 0);
      const after = Number.isFinite(lastEventId) && lastEventId > 0 ? lastEventId : 0;
      for (const segment of await liveRepo.listSince(meeting.id, after)) {
        send('segment', segment, segment.seq);
      }

      // The meeting is already over — replay was the whole point of this connection.
      if (meeting.status === 'transcribed' || meeting.status === 'failed') {
        send('done', { status: meeting.status });
        return res.end();
      }

      const unsubscribe = liveBus.subscribe(meeting.id, (event) => {
        if (event.type === 'segment') {
          send('segment', event.segment, event.segment.seq);
        } else if (event.type === 'partial') {
          send('partial', { speaker: event.speaker, text: event.text });
        } else {
          send('done', { status: event.status });
          res.end();
        }
      });

      // Comment frames keep proxies and load balancers from reaping a silent connection.
      //
      // The same tick re-reads the meeting status. `closeLiveTranscript` publishes `done` for
      // the normal endings, but a meeting can also be failed by the worker giving up after five
      // attempts or by the reconciler — neither holds a reference to the bus. Without this check
      // those connections would be kept alive by their own heartbeat forever.
      const heartbeat = setInterval(() => {
        if (res.writableEnded) return;
        res.write(': ping\n\n');
        meetingRepo.findById(meeting.id)
          .then((current) => {
            if (!current || current.status === 'transcribed' || current.status === 'failed') {
              send('done', { status: current?.status ?? 'failed' });
              res.end();
            }
          })
          .catch(() => { /* a transient DB blip must not kill a live transcript */ });
      }, 15000);

      // On SIGTERM, end the stream instead of letting it hold the server open. The client's
      // EventSource reconnects to the new instance on its own and replays from Last-Event-ID.
      const offShutdown = liveBus.onShutdown(() => {
        send('done', { status: meeting.status });
        res.end();
      });

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        offShutdown();
      };
      req.on('close', cleanup);
      res.on('close', cleanup);
      return undefined;
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id/live?after=<seq> — cursor polling, the fallback when SSE can't hold.
  // Same rows, same cursor, so the client can switch transports without losing its place.
  router.get('/api/meetings/:id/live', async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      }
      if (!liveRepo) {
        return res.status(503).json({ error: { code: 'LIVE_UNAVAILABLE', message: 'Live transcript is not enabled' } });
      }

      const parsedAfter = Number(req.query.after ?? 0);
      const after = Number.isFinite(parsedAfter) && parsedAfter > 0 ? parsedAfter : 0;
      const segments = await liveRepo.listSince(meeting.id, after);

      return res.status(200).json({
        segments,
        cursor: segments.length > 0 ? segments[segments.length - 1].seq : after,
        status: meeting.status,
      });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/meetings/:id/document
  router.post('/api/meetings/:id/document', documentLimiter, async (req, res, next) => {
    try {
      const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
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
      const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
      if (!meeting) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      }
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

      return res.status(200).json(toShareResponse(meeting, document, transcript || []));
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

