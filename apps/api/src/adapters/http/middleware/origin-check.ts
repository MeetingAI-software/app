import type { Request, Response, NextFunction } from 'express';
import { config } from '../../../config/env';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * §2 CSRF defense (belt to SameSite=Lax's braces): every state-changing /api request must carry
 * Origin === WEB_ORIGIN, else 403 — checked before auth. Webhooks live outside /api and keep their
 * own signature verification, so they are never reached by this.
 */
export function originCheck(req: Request, res: Response, next: NextFunction) {
  if (MUTATING.has(req.method) && req.headers.origin !== config.WEB_ORIGIN) {
    return res.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Cross-origin request refused' } });
  }
  return next();
}
