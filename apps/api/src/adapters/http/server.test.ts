import type { AddressInfo } from 'net';
import type { Server } from 'http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '../../domain/types';
import { config } from '../../config/env';
import { createServer } from './server';

const unverified: User = {
  id: 'user-unverified',
  email: 'pending@example.com',
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};
const verified: User = { ...unverified, id: 'user-verified', emailVerified: true };

/**
 * Stand-ins for the real surface: one ordinary gated route, the three escape hatches, and a route
 * that exists in neither allowlist — the last one is the point of the suite, since a new route
 * being gated by default is the whole reason the check lives in the server rather than per-route.
 */
function testRoutes(): express.Router {
  const router = express.Router();
  const ok = (_req: express.Request, res: express.Response) => res.status(200).json({ ok: true });
  router.get('/api/meetings', ok);
  router.post('/api/auth/change-email', ok);
  router.post('/api/auth/change-password', ok);
  router.delete('/api/auth/account', ok);
  router.get('/api/some-route-added-later', ok);
  router.get('/api/echo-ip', (req, res) => res.status(200).json({ ip: req.ip }));
  return router;
}

describe('email verification gate', () => {
  let server: Server;
  let baseUrl: string;
  let sessionUser: User = unverified;

  beforeAll(() => {
    const app = createServer([testRoutes()], async () => sessionUser);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  async function call(method: string, path: string) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN, cookie: 'session=t' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    });
  }

  it('blocks a gated route for an unverified session', async () => {
    sessionUser = unverified;

    const response = await call('GET', '/api/meetings');
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('gates a route that is in neither allowlist', async () => {
    sessionUser = unverified;

    const response = await call('GET', '/api/some-route-added-later');

    expect(response.status).toBe(403);
  });

  it.each([
    ['POST', '/api/auth/change-email'],
    ['POST', '/api/auth/change-password'],
    ['DELETE', '/api/auth/account'],
  ])('lets an unverified session through %s %s', async (method, path) => {
    sessionUser = unverified;

    const response = await call(method, path);

    expect(response.status).toBe(200);
  });

  it('lets a verified session through a gated route', async () => {
    sessionUser = verified;

    const response = await call('GET', '/api/meetings');

    expect(response.status).toBe(200);
  });

  /**
   * Every IP-keyed rate limit — login being the one that matters — is only as good as req.ip.
   * Railway forwards "<client>, <railway-internal>", and the internal address rotates, so trusting
   * one hop too few gives each request a fresh bucket and no limit ever fires.
   */
  describe('client IP behind Railway', () => {
    async function echoIp(forwardedFor: string): Promise<string> {
      sessionUser = verified;
      const response = await fetch(`${baseUrl}/api/echo-ip`, {
        headers: { origin: config.WEB_ORIGIN, cookie: 'session=t', 'x-forwarded-for': forwardedFor },
      });
      return (await response.json() as { ip: string }).ip;
    }

    it('resolves the client, not the internal proxy that rotates', async () => {
      expect(await echoIp('94.234.69.0, 79.127.151.145')).toBe('94.234.69.0');
      expect(await echoIp('94.234.69.0, 79.127.151.146')).toBe('94.234.69.0');
    });

    it('keeps one client in one bucket across the rotation', async () => {
      const first = await echoIp('94.234.69.0, 79.127.151.145');
      const second = await echoIp('94.234.69.0, 79.127.151.146');

      expect(first).toBe(second);
    });
  });
});
