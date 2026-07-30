import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import type { CustomerPortalService } from '../../../application/customer-portal.service';
import { createServer } from '../server';
import { createBillingRoutes } from './billing.routes';

describe('billing portal route', () => {
  const createForUser = vi.fn();
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    const service = { createForUser } as unknown as CustomerPortalService;
    const app = createServer([createBillingRoutes(service)], async (token) => token === 'valid-token' ? {
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    } : null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    createForUser.mockReset();
    createForUser.mockResolvedValue('https://sandbox-login.paddle.com/session');
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('rejects anonymous requests before minting a portal session', async () => {
    const response = await fetch(`${baseUrl}/api/me/billing-portal`, {
      method: 'POST', headers: { origin: config.WEB_ORIGIN },
    });
    expect(response.status).toBe(401);
    expect(createForUser).not.toHaveBeenCalled();
  });

  it('uses only the authenticated user id and returns only the portal URL', async () => {
    const response = await fetch(`${baseUrl}/api/me/billing-portal`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN,
        cookie: 'session=valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ customerId: 'ctm_someone_else' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: 'https://sandbox-login.paddle.com/session' });
    expect(createForUser).toHaveBeenCalledWith('user-1');
  });
});
