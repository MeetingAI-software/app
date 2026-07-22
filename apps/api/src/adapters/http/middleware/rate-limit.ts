import type { Request, Response, NextFunction, RequestHandler } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter. Per-instance by design (§2) — right-sized for a single
 * Railway node; if this ever scales to multiple instances, move the counter to a shared store.
 * The key is computed per-request (e.g. IP + email) so callers decide the bucketing.
 */
export function fixedWindowLimiter(opts: {
  max: number;
  windowMs: number;
  keyOf: (req: Request) => string;
}): RequestHandler {
  const windows = new Map<string, Window>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.keyOf(req);
    const now = Date.now();
    const w = windows.get(key);

    if (!w || now >= w.resetAt) {
      windows.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (w.count >= opts.max) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } });
    }
    w.count += 1;
    return next();
  };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Day 6 §2 spend limits — the money-burning endpoints, keyed `userId:routeName` so each user gets
 * their own bucket per route (falls back to IP before auth, though these routes always run behind
 * requireUser). Numbers live in code (house style). These are speed bumps above the monthly cap:
 * a stuck retry-loop or an abusive user hits a wall in seconds, not after burning the budget.
 */
export const SPEND_LIMITS = {
  chat: { max: 10, windowMs: MINUTE },           // 10 / minute
  document: { max: 3, windowMs: MINUTE },        // 3 / minute
  upload: { max: 5, windowMs: HOUR },            // 5 / hour
  meetingCreate: { max: 10, windowMs: HOUR },    // 10 / hour
} as const;

/** Fixed-window limiter bucketed per authenticated user per route → 429 (standard error shape). */
export function perUserRouteLimiter(routeName: string, limit: { max: number; windowMs: number }): RequestHandler {
  return fixedWindowLimiter({
    max: limit.max,
    windowMs: limit.windowMs,
    keyOf: (req) => `${req.userId ?? req.ip}:${routeName}`,
  });
}
