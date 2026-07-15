import { Router } from 'express';
import type { WebhookEventRepository } from '../../../ports/repositories.port';

export function createWebhookRoutes(webhookRepo: WebhookEventRepository): Router {
  const router = Router();

  router.post('/webhooks/recall', async (req, res, next) => {
    try {
      const eventId = req.headers['x-recall-event-id'] || `recall-evt-${Date.now()}`;
      const eventType = req.body.event || 'transcript_ready';
      
      // Save the webhook event in the background queue
      await webhookRepo.insertIfNew({
        provider: 'recall',
        externalEventId: String(eventId),
        eventType: String(eventType),
        payload: req.body,
      });

      return res.status(200).json({ received: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
