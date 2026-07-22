import { Router } from 'express';
import { z } from 'zod';
import type { ChatService } from '../../../application/chat.service';
import type { MeetingRepository } from '../../../ports/repositories.port';
import { perUserRouteLimiter, SPEND_LIMITS } from '../middleware/rate-limit';

export function createChatRoutes(meetingRepo: MeetingRepository, chatService: ChatService): Router {
  const router = Router();

  // Day 6 §2 spend limit: each question re-reads the whole meeting (~€0.02).
  const chatLimiter = perUserRouteLimiter('chat', SPEND_LIMITS.chat);

  const askSchema = z.object({
    question: z.string().trim().min(1, 'Question cannot be empty').max(500, 'Question is too long'),
  });

  // Ownership gate shared by both handlers: a chat only exists for a meeting you own (miss → 404).
  async function ownedOr404(req: any, res: any): Promise<boolean> {
    const meeting = await meetingRepo.findByIdForUser(req.params.id, req.userId!);
    if (!meeting) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      return false;
    }
    return true;
  }

  // POST /api/meetings/:id/chat  → ask a grounded question
  router.post('/api/meetings/:id/chat', chatLimiter, async (req, res, next) => {
    try {
      if (!(await ownedOr404(req, res))) return;
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
      if (!(await ownedOr404(req, res))) return;
      const result = await chatService.getHistory(req.params.id);
      return res.status(200).json(result);    // { messages, remaining }
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
