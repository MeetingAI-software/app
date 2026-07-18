import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../../../config/env';
import type { WebhookEventRepository } from '../../../ports/repositories.port';
import { verifyWebhookSignature } from '../../recall/recall-webhook.verifier';
import {
  verifyTranscriptionSecret,
  TRANSCRIPTION_WEBHOOK_HEADER,
} from '../../assemblyai/transcription-webhook.verifier';

export function createWebhookRoutes(webhookRepo: WebhookEventRepository): Router {
  const router = Router();

  router.post('/webhooks/recall', async (req, res, next) => {
    try {
      // 1. Verify signature
      if (!verifyWebhookSignature(req)) {
        console.warn('⚠️ Webhook signature verification failed for /webhooks/recall');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 2. Extract provider event ID or hash the raw body
      const svixId = req.headers['webhook-id'] || req.headers['svix-id'];
      let eventId = svixId ? String(svixId) : '';
      if (!eventId) {
        const rawBody = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : '';
        eventId = crypto.createHash('sha256').update(rawBody).digest('hex');
      }

      // 3. Extract event type (Recall uses req.body.event)
      const eventType = req.body.event || 'transcript_ready';

      // 4. Save the webhook event in the database for asynchronous worker processing
      await webhookRepo.insertIfNew({
        provider: 'recall',
        externalEventId: eventId,
        eventType: String(eventType),
        payload: req.body,
      });

      // 5. Respond 200 within <1s
      return res.status(200).json({ received: true });
    } catch (err) {
      return next(err);
    }
  });

  // AssemblyAI calls this when an upload's transcription finishes. Verify the shared secret,
  // enqueue a `transcription_ready` job keyed by the transcript id (idempotent), respond fast.
  router.post('/webhooks/transcription', async (req, res, next) => {
    try {
      if (!verifyTranscriptionSecret(config.TRANSCRIPTION_WEBHOOK_SECRET, req.headers[TRANSCRIPTION_WEBHOOK_HEADER])) {
        console.warn('⚠️ Webhook secret verification failed for /webhooks/transcription');
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }

      const transcriptId = req.body?.transcript_id;
      if (!transcriptId) {
        return res.status(400).json({ error: 'Missing transcript_id' });
      }

      // externalEventId = the transcript id → replaying the same webhook yields exactly one job.
      // The worker resolves the meeting via findByTranscriptionJobId(jobId).
      await webhookRepo.insertIfNew({
        provider: 'assemblyai',
        externalEventId: String(transcriptId),
        eventType: 'transcription_ready',
        payload: { jobId: String(transcriptId), status: req.body?.status },
      });

      return res.status(200).json({ received: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
