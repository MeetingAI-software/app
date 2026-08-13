import type { AddressInfo } from 'net';
import type { Server } from 'http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../../domain/types';
import { config } from '../../../config/env';
import { createServer } from '../server';

// ---------------------------------------------------------------------------
// originCheck is the CSRF defence (server.ts:86, mounted at '/api'). It is the
// belt to SameSite=Lax's braces: every state-changing /api request must arrive
// with Origin === WEB_ORIGIN.
//
// Nothing else in the suite exercises it. Remove the `MUTATING` set and every
// other test still passes — while any page the victim happens to have open
// gains the ability to act as them, because the browser attaches the session
// cookie to cross-site requests all on its own.
//
// The server is stood up through createServer rather than by calling the
// middleware directly, because half of what matters here is WHERE it is
// mounted: ahead of auth, and only under /api.
// ---------------------------------------------------------------------------

const USER: User = {
  id: 'user-1',
  email: 'person@example.com',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const FOREIGN_ORIGIN = 'https://evil.example';

function testRoutes(): express.Router {
  const router = express.Router();
  const ok = (_req: express.Request, res: express.Response) => res.status(200).json({ ok: true });
  router.get('/api/thing', ok);
  router.post('/api/thing', ok);
  router.put('/api/thing', ok);
  router.patch('/api/thing', ok);
  router.delete('/api/thing', ok);
  // Outside /api deliberately: providers post from their own servers with no Origin at all, and
  // are authenticated by signature instead. If originCheck ever reached here, every webhook breaks.
  router.post('/webhooks/thing', ok);
  return router;
}

describe('originCheck (CSRF)', () => {
  const authenticate = vi.fn(async (_token: string): Promise<User | null> => USER);
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    const app = createServer([testRoutes()], authenticate);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    authenticate.mockClear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  /** `origin: undefined` means the header is genuinely absent, not empty. */
  function send(method: string, path: string, origin?: string, cookie: string | null = 'session=t') {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(origin ? { origin } : {}),
      },
      ...(method === 'GET' ? {} : { body: '{}' }),
    });
  }

  it('refuses a state-changing request that carries no Origin at all', async () => {
    const response = await send('POST', '/api/thing');
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN_ORIGIN');
    expect(body.error.message).toBe('Cross-origin request refused');
  });

  it('refuses a state-changing request from somebody else’s website', async () => {
    const response = await send('POST', '/api/thing', FOREIGN_ORIGIN);

    expect(response.status).toBe(403);
  });

  it('lets our own web app through', async () => {
    const response = await send('POST', '/api/thing', config.WEB_ORIGIN);

    expect(response.status).toBe(200);
  });

  // Every verb that can change state, not just POST. A gap here is a whole method left open —
  // DELETE /api/auth/account being the one that costs the user everything.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('gates %s in both directions', async (method) => {
    expect((await send(method, '/api/thing', FOREIGN_ORIGIN)).status).toBe(403);
    expect((await send(method, '/api/thing', config.WEB_ORIGIN)).status).toBe(200);
  });

  // Reads are exempt on purpose: the share page and the console's own GETs are cross-origin by
  // design (app.→api.), and CORS already governs who may read the response.
  it('leaves reads alone — a GET with no Origin still works', async () => {
    expect((await send('GET', '/api/thing')).status).toBe(200);
    expect((await send('GET', '/api/thing', FOREIGN_ORIGIN)).status).toBe(200);
  });

  // THE ordering test. originCheck is mounted ahead of requireUser (server.ts:86 before :89) so a
  // forged cross-site request is refused without the session ever being looked up. If the order
  // were swapped the request would authenticate first — and any handler mounted before the check,
  // or any early exit inside auth, would already be acting on the attacker's behalf.
  it('refuses before authentication is even attempted', async () => {
    const response = await send('POST', '/api/thing', FOREIGN_ORIGIN, 'session=valid');

    expect(response.status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('answers 403, not 401, when the caller has no session either', async () => {
    const response = await send('POST', '/api/thing', FOREIGN_ORIGIN, null);

    expect(response.status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('never touches webhooks, which live outside /api and prove themselves by signature', async () => {
    const response = await send('POST', '/webhooks/thing', undefined, null);

    expect(response.status).toBe(200);
  });
});
