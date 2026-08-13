import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../../domain/types';
import { requireUser } from './require-user';

// ---------------------------------------------------------------------------
// requireUser is the gate every private endpoint sits behind (server.ts:89).
// Driven directly rather than through a server, so each branch is isolated —
// in particular that `authenticate` is not even consulted when there is no
// token to consult it with, and that a thrown authenticator is forwarded as an
// error rather than mistaken for a successful login.
// ---------------------------------------------------------------------------

const USER: User = {
  id: 'user-1',
  email: 'person@example.com',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function mkReq(cookie?: string): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as unknown as Request;
}

function mkRes() {
  const res: Record<string, unknown> = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  return res as unknown as Response & { statusCode: number; body: unknown };
}

async function run(
  authenticate: (token: string) => Promise<User | null>,
  cookie?: string,
) {
  const req = mkReq(cookie);
  const res = mkRes();
  const next = vi.fn();
  await requireUser(authenticate)(req, res, next);
  return { req, res, next };
}

describe('requireUser', () => {
  // No token means no lookup. Beyond being wasteful, calling the authenticator with an empty string
  // invites a session store that treats '' as a wildcard to hand back somebody's account.
  it('rejects a request with no cookies without consulting the session store', async () => {
    const authenticate = vi.fn(async () => USER);

    const { res, next } = await run(authenticate);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED' } });
    expect(authenticate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a request whose cookies do not include a session', async () => {
    const authenticate = vi.fn(async () => USER);

    const { res, next } = await run(authenticate, 'theme=dark; consent=1');

    expect(res.statusCode).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an empty session cookie without consulting the session store', async () => {
    const authenticate = vi.fn(async () => USER);

    const { res } = await run(authenticate, 'session=');

    expect(res.statusCode).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

  // An expired or revoked session resolves to null. This is the branch that makes logout mean
  // something: the cookie survives in the browser, and the answer must still be 401.
  it('rejects a token the session store does not recognise', async () => {
    const authenticate = vi.fn(async () => null);

    const { res, next } = await run(authenticate, 'session=stale-token');

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes the token through exactly as the cookie carried it', async () => {
    const authenticate = vi.fn(async () => USER);

    await run(authenticate, 'other=1; session=abc123; last=2');

    expect(authenticate).toHaveBeenCalledWith('abc123');
  });

  it('lets a recognised session through and attaches the user id', async () => {
    const authenticate = vi.fn(async () => USER);

    const { req, res, next } = await run(authenticate, 'session=good');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();          // no error argument
    expect(req.userId).toBe('user-1');
    expect(res.status).not.toHaveBeenCalled();
  });

  // Carried forward so requireVerifiedEmail can gate without a second query. If this were dropped,
  // that middleware would read `undefined` and every unverified account would sail past it.
  it('carries the verification flag forward, false included', async () => {
    const verified = await run(vi.fn(async () => USER), 'session=good');
    expect(verified.req.emailVerified).toBe(true);

    const pending = await run(vi.fn(async () => ({ ...USER, emailVerified: false })), 'session=good');
    expect(pending.req.emailVerified).toBe(false);
  });

  // A session store that is down must produce a 500 through the error handler, never a silent pass
  // and never a 401 — "the database blinked" and "you are not logged in" are different answers, and
  // logging the user out on a transient blip is its own bug.
  it('forwards an authenticator failure as an error instead of a 401', async () => {
    const boom = new Error('session store down');
    const authenticate = vi.fn(async () => { throw boom; });

    const { res, next } = await run(authenticate, 'session=good');

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);            // nothing was written to the response
  });
});
