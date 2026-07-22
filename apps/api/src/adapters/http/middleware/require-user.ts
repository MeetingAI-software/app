import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { User } from '../../../domain/types';
import { readSessionCookie } from '../cookies';

// Make the authenticated user id available to downstream route handlers (Step 6 scopes on it).
declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

type Authenticate = (sessionToken: string) => Promise<User | null>;

/**
 * §7: session cookie → `authenticate` (which validates + lazily expires the session) → attach
 * req.userId, else 401. Replaces the Day 4 shared-key `requireAdmin`.
 */
export function requireUser(authenticate: Authenticate): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = readSessionCookie(req);
      if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
      const user = await authenticate(token);
      if (!user) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
      req.userId = user.id;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
