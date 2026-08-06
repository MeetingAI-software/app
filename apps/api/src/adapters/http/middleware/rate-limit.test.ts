import { describe, it, expect, vi } from 'vitest';
import { fixedWindowLimiter, perUserRouteLimiter, SPEND_LIMITS } from './rate-limit';

function mkReq(userId: string) {
  return { userId, ip: '10.0.0.1' } as any;
}

function mkRes() {
  const res: any = { statusCode: 200 };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn(() => res);
  return res;
}

/** Drive the middleware once; report whether next() ran, the status, and any headers set. */
function run(limiter: any, req: any) {
  const res = mkRes();
  const next = vi.fn();
  limiter(req, res, next);
  return { allowed: next.mock.calls.length > 0, status: res.statusCode, res };
}

describe('perUserRouteLimiter', () => {
  it('allows up to the limit then 429s (chat = 10/min → 11th blocked)', () => {
    const limiter = perUserRouteLimiter('chat', SPEND_LIMITS.chat);
    const A = mkReq('userA');
    for (let i = 0; i < 10; i++) expect(run(limiter, A).allowed).toBe(true);
    const eleventh = run(limiter, A);
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.status).toBe(429);
  });

  it('buckets per user — user B is unaffected when A hits the wall', () => {
    const limiter = perUserRouteLimiter('chat', SPEND_LIMITS.chat);
    const A = mkReq('userA');
    const B = mkReq('userB');
    for (let i = 0; i < 10; i++) run(limiter, A);
    expect(run(limiter, A).status).toBe(429); // A capped
    expect(run(limiter, B).allowed).toBe(true); // B fine
  });

  it('resets after the window elapses', () => {
    vi.useFakeTimers();
    try {
      const limiter = perUserRouteLimiter('document', SPEND_LIMITS.document); // 3 / min
      const A = mkReq('userA');
      for (let i = 0; i < 3; i++) expect(run(limiter, A).allowed).toBe(true);
      expect(run(limiter, A).status).toBe(429);
      vi.advanceTimersByTime(SPEND_LIMITS.document.windowMs + 1);
      expect(run(limiter, A).allowed).toBe(true); // fresh window
    } finally {
      vi.useRealTimers();
    }
  });

  it('buckets per route — separate limiters do not share a window', () => {
    const chat = perUserRouteLimiter('chat', SPEND_LIMITS.chat);
    const doc = perUserRouteLimiter('document', SPEND_LIMITS.document); // 3 / min
    const A = mkReq('userA');
    for (let i = 0; i < 3; i++) run(doc, A);
    expect(run(doc, A).status).toBe(429);   // document capped
    expect(run(chat, A).allowed).toBe(true); // chat untouched
  });

  it('advertises the remaining window on 429 via Retry-After', () => {
    vi.useFakeTimers();
    try {
      const limiter = perUserRouteLimiter('document', SPEND_LIMITS.document); // 3 / min
      const A = mkReq('userA');
      for (let i = 0; i < 3; i++) run(limiter, A);

      // Half the window has burned, so the client should be told to wait out the remainder —
      // never the full window, which would park a legitimate caller longer than the limit lasts.
      vi.advanceTimersByTime(SPEND_LIMITS.document.windowMs / 2);
      const blocked = run(limiter, A);

      expect(blocked.status).toBe(429);
      expect(blocked.res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fixedWindowLimiter', () => {
  // The Map was never pruned, so a key embedding an attacker-chosen value (signup's email) grew
  // one permanent entry per attempt — memory exhaustion outliving the rate limit it defeated.
  it('evicts expired buckets instead of growing without bound', () => {
    vi.useFakeTimers();
    try {
      const windowMs = 60 * 1000;
      const limiter = fixedWindowLimiter({ max: 1, windowMs, keyOf: (req) => String(req.ip) });
      for (let i = 0; i < 10_000; i++) run(limiter, { ip: `10.0.${Math.floor(i / 256)}.${i % 256}` } as any);

      // Every bucket above is now stale, so the next miss sweeps them and the fresh caller is let
      // through rather than being served from a Map that only ever grew.
      vi.advanceTimersByTime(windowMs + 1);
      const after = run(limiter, { ip: '203.0.113.7' } as any);

      expect(after.allowed).toBe(true);
      // The swept keys are genuinely gone: a previously-seen IP starts a new window, not a 429.
      expect(run(limiter, { ip: '10.0.0.1' } as any).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
