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
