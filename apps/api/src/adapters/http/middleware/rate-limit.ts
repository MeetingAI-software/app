import type { Request, Response, NextFunction, RequestHandler } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Above this many live buckets, a miss sweeps the expired ones before allocating. Nothing here is
 * per-user state worth preserving, so the ceiling only has to sit above any legitimate concurrent
 * client count — 10k is generous for a single node and still bounded.
 */
const MAX_TRACKED_KEYS = 10_000;

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
      // Nothing ever deleted from this Map before, and keys that embed an attacker-chosen value
      // (the signup limiter's email) grow one entry per attempt — an unbounded allocation on a
      // single-replica box. Sweeping only on a miss past the ceiling keeps the hot path O(1).
      if (windows.size >= MAX_TRACKED_KEYS) {
        for (const [k, entry] of windows) {
          if (now >= entry.resetAt) windows.delete(k);
        }
      }
      windows.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (w.count >= opts.max) {
      // Seconds until this bucket frees up, so a client (or a proxy, or curl -i) can back off by
      // the real window instead of guessing. Rounded up: a 0 here would invite an instant retry.
      res.setHeader('Retry-After', String(Math.ceil((w.resetAt - now) / 1000)));
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
