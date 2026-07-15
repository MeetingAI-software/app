import { Router } from 'express';
import crypto from 'crypto';
import type { WebhookEventRepository } from '../../../ports/repositories.port';
import { verifyWebhookSignature } from '../../recall/recall-webhook.verifier';

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

  return router;
}
