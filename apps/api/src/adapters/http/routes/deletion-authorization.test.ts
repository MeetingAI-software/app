import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../../db/pglite-harness';
import { accountDeletionAuthorizations as grants, sessions, users } from '../../db/schema';
import { DrizzleUserRepository } from '../../db/repositories/user.repository';
import { DrizzleSessionRepository } from '../../db/repositories/session.repository';
import { DrizzleDeletionAuthorizationRepository } from '../../db/repositories/deletion-authorization.repository';
import { DeletionAuthorizationService } from '../../../application/deletion-authorization.service';
import { AuthService } from '../../../application/auth.service';
import type { GoogleDeletionIdentity } from '../../../ports/deletion-authorization.port';
import { DeletionReauthenticationRequiredError } from '../../../domain/errors';
import { createAuthRoutes } from './auth.routes';
import { createServer } from '../server';
import { config } from '../../../config/env';
import { DELETION_GRANT_COOKIE } from '../cookies';

vi.mock('../../db/client', () => ({ db }));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const minute = 60_000;

describe('Google deletion across HTTP, service and PostgreSQL', () => {
  let service: DeletionAuthorizationService;
  let auth: AuthService;
  let provider: GoogleDeletionIdentity;
  let userId: string;
  let sessionId: string;
  let server: Server;
  let base: string;
  let nonce: string;
  const token = 'synthetic-current-session';
  const storageDelete = vi.fn();
  const meetingList = vi.fn();
  const link = vi.fn();

  beforeAll(migrateOnce);
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
    storageDelete.mockResolvedValue(undefined);
    meetingList.mockResolvedValue([]);
    const userRepo = new DrizzleUserRepository();
    const sessionRepo = new DrizzleSessionRepository();
    const user = await userRepo.create({ email: 'google@example.test', passwordHash: null, googleId: 'linked-sub', emailVerified: false });
    userId = user.id;
    sessionId = (await sessionRepo.create({ userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 60 * minute) })).id;
    provider = {
      audience: 'synthetic-google-client',
      authorizationUrl: vi.fn((state, n) => { nonce = n; return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&nonce=${n}`; }),
      verifyCode: vi.fn(async () => ({ sub: 'linked-sub', nonce, aud: 'synthetic-google-client',
        iss: 'https://accounts.google.com', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })),
    };
    service = new DeletionAuthorizationService(new DrizzleDeletionAuthorizationRepository(), sessionRepo, userRepo, provider);
    auth = new AuthService(userRepo, sessionRepo, { hash: vi.fn(), verify: vi.fn(async (p) => p === 'right-password') }, 7,
      { listForUser: meetingList, deleteById: vi.fn() } as never,
      { deleteByMeeting: vi.fn() } as never, { deleteByMeeting: vi.fn() } as never,
      { deleteByMeeting: vi.fn() } as never, { deleteByMeeting: vi.fn() } as never,
      { delete: storageDelete } as never, { deleteRecording: vi.fn() } as never,
      {} as never, {} as never, {} as never, undefined, service);
    vi.spyOn(auth, 'loginOrCreateGoogleUser').mockImplementation(link);
    server = createServer([createAuthRoutes(auth, service)], (t) => auth.getUserForToken(t)).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  async function start() {
    const url = new URL(await service.start(userId, token));
    return url.searchParams.get('state')!;
  }
  async function grant() { return service.complete(token, await start(), 'synthetic-code'); }
  async function remove(grantToken?: string, password?: string) {
    return fetch(`${base}/api/auth/account`, { method: 'DELETE',
      headers: { origin: config.WEB_ORIGIN, 'content-type': 'application/json',
        cookie: `session=${token}${grantToken ? `; ${DELETION_GRANT_COOKIE}=${grantToken}` : ''}` },
      body: JSON.stringify({ password }),
    });
  }

  it('denies a stolen ordinary session plus DELETE before any erasure', async () => {
    const res = await remove(undefined, 'DELETE');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'DELETION_REAUTH_REQUIRED' } });
    expect(meetingList).not.toHaveBeenCalled();
    expect((await db.select().from(users))).toHaveLength(1);
  });

  it('requires authentication and matching Origin for start, including unverified Google accounts', async () => {
    const url = `${base}/api/auth/account/deletion/google`;
    expect((await fetch(url, { method: 'POST', headers: { origin: config.WEB_ORIGIN } })).status).toBe(401);
    expect((await fetch(url, { method: 'POST', headers: { origin: 'https://attacker.example', cookie: `session=${token}` } })).status).toBe(403);
    const res = await fetch(url, { method: 'POST', headers: { origin: config.WEB_ORIGIN, cookie: `session=${token}` } });
    expect(res.status).toBe(200);
    const { url: authorizationUrl } = await res.json() as { url: string };
    const state = new URL(authorizationUrl).searchParams.get('state');
    const [row] = await db.select().from(grants);
    expect(state).toMatch(/^delete\.[\w-]{43}$/);
    expect(row.stateHash).toBe(hash(state!));
    expect(row.nonceHash).toBe(hash(nonce));
    expect(JSON.stringify(row)).not.toContain(nonce);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(10 * minute);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns from callback with a private cookie and requires a separate final deletion', async () => {
    const state = await start();
    const res = await fetch(`${base}/api/auth/google/callback?state=${state}&code=synthetic`, {
      headers: { cookie: `session=${token}` }, redirect: 'manual',
    });
    expect(res.headers.get('location')).toBe(`${config.WEB_ORIGIN}/settings?deletion=verified`);
    const cookie = res.headers.getSetCookie().find(c => c.startsWith(`${DELETION_GRANT_COOKIE}=`) && !c.includes('Expires=Thu, 01 Jan 1970'))!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/account');
    expect(link).not.toHaveBeenCalled(); expect(meetingList).not.toHaveBeenCalled();
    const raw = cookie.split(';')[0].split('=')[1];
    const [row] = await db.select().from(grants);
    expect(row.grantHash).toBe(hash(raw));
    expect(row.grantExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(5 * minute);
    expect((await remove(raw)).status).toBe(204);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(grants)).toHaveLength(0); // session/user cascades
  });

  it.each([
    ['sub', 'other-account'], ['nonce', 'wrong-nonce'], ['aud', 'another-client'], ['iss', 'https://evil.example'],
    ['iat', 1], ['iat', Math.floor(Date.now() / 1000) + 3600], ['exp', 1], ['nonce', undefined], ['iat', undefined],
  ])('rejects invalid signed claim %s=%s and consumes the challenge', async (key, value) => {
    const state = await start();
    const original = await provider.verifyCode('synthetic');
    vi.mocked(provider.verifyCode).mockResolvedValue({ ...original, [key]: value });
    await expect(service.complete(token, state, 'synthetic')).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
    vi.mocked(provider.verifyCode).mockResolvedValue(original);
    await expect(service.complete(token, state, 'synthetic')).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
    expect((await db.select().from(grants))[0].grantHash).toBeNull();
  });

  it('rejects unknown state, another session of the same user, and another user session', async () => {
    const state = await start();
    const repo = new DrizzleSessionRepository();
    await repo.create({ userId, tokenHash: hash('second-session'), expiresAt: new Date(Date.now() + minute) });
    const [other] = await db.insert(users).values({ email: 'other@example.test', googleId: 'other-sub' }).returning();
    await repo.create({ userId: other.id, tokenHash: hash('other-session'), expiresAt: new Date(Date.now() + minute) });
    for (const [t, s] of [[token, 'delete.unknown'], ['second-session', state], ['other-session', state]]) {
      await expect(service.complete(t, s, 'code')).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
    }
    expect(provider.verifyCode).not.toHaveBeenCalled();
  });

  it.each(['challenge', 'grant', 'session'])('rejects expired %s', async (kind) => {
    const state = await start();
    if (kind === 'challenge') {
      await db.update(grants).set({ expiresAt: new Date(0) });
      await expect(service.complete(token, state, 'code')).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
    } else {
      const g = await service.complete(token, state, 'code');
      if (kind === 'grant') await db.update(grants).set({ grantExpiresAt: new Date(0) });
      else await db.update(sessions).set({ expiresAt: new Date(0) });
      await expect(service.consume(userId, token, g.token)).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
    }
  });

  it('cannot replay a provider answer from the previous challenge', async () => {
    await start();
    const old = await provider.verifyCode('old');
    const state = await start();
    vi.mocked(provider.verifyCode).mockResolvedValue(old);
    await expect(service.complete(token, state, 'old')).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
  });

  it('allows exactly one concurrent callback and exactly one concurrent grant consumer', async () => {
    const state = await start();
    const callbacks = await Promise.allSettled(Array.from({ length: 8 }, () => service.complete(token, state, 'code')));
    const successes = callbacks.filter(c => c.status === 'fulfilled');
    expect(successes).toHaveLength(1);
    expect(provider.verifyCode).toHaveBeenCalledTimes(1);
    const g = (successes[0] as PromiseFulfilledResult<{ token: string }>).value;
    const uses = await Promise.allSettled(Array.from({ length: 8 }, () => service.consume(userId, token, g.token)));
    expect(uses.filter(c => c.status === 'fulfilled')).toHaveLength(1);
  });

  it('cannot use a grant with a different session or after a new start', async () => {
    const g = await grant();
    await new DrizzleSessionRepository().create({ userId, tokenHash: hash('second'), expiresAt: new Date(Date.now() + minute) });
    await expect(service.consume(userId, 'second', g.token)).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
    await start();
    await expect(service.consume(userId, token, g.token)).rejects.toBeInstanceOf(DeletionReauthenticationRequiredError);
  });

  it('fails closed on provider verification error without login/link or raw error details', async () => {
    const state = await start();
    vi.mocked(provider.verifyCode).mockRejectedValue(new Error('secret-provider-token'));
    const res = await fetch(`${base}/api/auth/google/callback?state=${state}&code=synthetic`, {
      headers: { cookie: `session=${token}` }, redirect: 'manual',
    });
    expect(res.headers.get('location')).toBe(`${config.WEB_ORIGIN}/settings?deletion=failed`);
    expect((await db.select().from(grants))[0].grantHash).toBeNull();
    expect(link).not.toHaveBeenCalled(); expect(meetingList).not.toHaveBeenCalled();
  });

  it('does not restore a consumed grant after provider erasure fails', async () => {
    const g = await grant();
    meetingList.mockResolvedValue([{ id: 'synthetic-meeting', audioStoragePath: 'synthetic/audio', source: 'upload' }]);
    storageDelete.mockRejectedValue(new Error('synthetic storage failure'));
    expect((await remove(g.token)).status).toBe(503);
    expect((await remove(g.token)).status).toBe(403);
    expect(storageDelete).toHaveBeenCalledTimes(1);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect((await db.select().from(grants))[0].consumedAt).not.toBeNull();
  });

  it('keeps password precedence for linked accounts and rejects a revoked session at SQL boundary', async () => {
    const g = await grant();
    await db.update(users).set({ passwordHash: 'synthetic-hash' }).where(eq(users.id, userId));
    expect((await remove(g.token)).status).toBe(401);
    expect((await remove(undefined, 'right-password')).status).toBe(204);
    expect(await db.select().from(grants)).toHaveLength(0);
    expect(await new DrizzleDeletionAuthorizationRepository().consumeGrant({ userId, sessionId, googleSub: 'linked-sub',
      grantHash: hash(g.token), now: new Date() })).toBe(false);
  });
});
