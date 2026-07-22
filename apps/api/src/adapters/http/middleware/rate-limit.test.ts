import { describe, it, expect, vi } from 'vitest';
import { perUserRouteLimiter, SPEND_LIMITS } from './rate-limit';

function mkReq(userId: string) {
  return { userId, ip: '10.0.0.1' } as any;
}

function mkRes() {
  const res: any = { statusCode: 200 };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn(() => res);
  return res;
}

/** Drive the middleware once; report whether next() ran and the response status. */
function run(limiter: any, req: any) {
  const res = mkRes();
  const next = vi.fn();
  limiter(req, res, next);
  return { allowed: next.mock.calls.length > 0, status: res.statusCode };
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
});
