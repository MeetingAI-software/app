import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireVerifiedEmail } from './require-verified-email';

function run(req: Partial<Request>) {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  const next = vi.fn();
  requireVerifiedEmail(req as Request, res, next);
  return { res, next, json };
}

describe('requireVerifiedEmail', () => {
  it('passes a verified user through', () => {
    const { next, res } = run({ userId: 'u1', emailVerified: true });

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects an unverified user with 403 EMAIL_NOT_VERIFIED', () => {
    const { next, res, json } = run({ userId: 'u1', emailVerified: false });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address to continue' },
    });
  });

  // Fail closed: an absent flag means the route was mounted outside requireUser, which is a wiring
  // bug. Treating "unknown" as verified would silently open the spend endpoints.
  it('rejects when the flag is missing entirely', () => {
    const { next, res } = run({});

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
