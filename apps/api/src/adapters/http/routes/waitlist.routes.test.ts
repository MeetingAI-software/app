import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import { createServer } from '../server';
import { createWaitlistRoutes } from './waitlist.routes';
import type { WaitlistRepository } from '../../../ports/repositories.port';

describe('POST /api/waitlist', () => {
  let server: Server;
  let baseUrl: string;
  let waitlist: { add: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };

  function post(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: config.WEB_ORIGIN, ...headers },
      body: JSON.stringify(body),
    });
  }

  beforeAll(() => {
    waitlist = { add: vi.fn(), count: vi.fn() };
    // The session probe always says "nobody" — this route has to work for a signed-out visitor.
    const app = createServer([createWaitlistRoutes(waitlist as unknown as WaitlistRepository)], async () => null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    waitlist.add.mockReset().mockResolvedValue(true);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  // The whole reason the waitlist exists is that sign-in is closed, so a session cannot be the
  // price of entry. This is the test that fails if the route is ever moved behind requireUser.
  it('accepts an address with no session at all', async () => {
    const res = await post({ email: 'person@example.com' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ joined: true });
    expect(waitlist.add).toHaveBeenCalledWith({ email: 'person@example.com', source: 'signin' });
  });

  it('records which dialog the address came from', async () => {
    await post({ email: 'buyer@example.com', source: 'upgrade' });

    expect(waitlist.add).toHaveBeenCalledWith({ email: 'buyer@example.com', source: 'upgrade' });
  });

  it('trims a pasted address before storing it', async () => {
    await post({ email: '  person@example.com  ' });

    expect(waitlist.add).toHaveBeenCalledWith({ email: 'person@example.com', source: 'signin' });
  });

  it('rejects an address that is not one', async () => {
    const res = await post({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(waitlist.add).not.toHaveBeenCalled();
  });

  it('rejects an unknown source rather than storing a stray label', async () => {
    const res = await post({ email: 'person@example.com', source: 'somewhere-else' });

    expect(res.status).toBe(400);
    expect(waitlist.add).not.toHaveBeenCalled();
  });

  // An unauthenticated endpoint that answers differently for a known address is an oracle: anyone
  // could ask it whether a given person is waiting for Syncmemos. Same body either way.
  it('answers identically for an address that is already on the list', async () => {
    waitlist.add.mockResolvedValue(false);

    const res = await post({ email: 'person@example.com' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ joined: true });
  });

  it('refuses a cross-origin submission', async () => {
    const res = await post({ email: 'person@example.com' }, { Origin: 'https://evil.example' });

    expect(res.status).toBe(403);
    expect(waitlist.add).not.toHaveBeenCalled();
  });
});
