import { Router } from 'express';
import { z } from 'zod';
import type { ChatService } from '../../../application/chat.service';

export function createChatRoutes(chatService: ChatService): Router {
  const router = Router();

  const askSchema = z.object({
    question: z.string().trim().min(1, 'Question cannot be empty').max(500, 'Question is too long'),
  });

  // POST /api/meetings/:id/chat  → ask a grounded question
  router.post('/api/meetings/:id/chat', async (req, res, next) => {
    try {
      const { question } = askSchema.parse(req.body);
      const result = await chatService.ask(req.params.id, question);
      return res.status(200).json(result);   // { answer, remaining }
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id/chat  → history + questions remaining
  router.get('/api/meetings/:id/chat', async (req, res, next) => {
    try {
      const result = await chatService.getHistory(req.params.id);
      return res.status(200).json(result);    // { messages, remaining }
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
