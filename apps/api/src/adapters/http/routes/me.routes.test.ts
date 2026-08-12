import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { UsageRepository } from '../../../ports/repositories.port';
import type { BillingAccessProvider } from '../../../domain/billing';
import { PLAN_ENTITLEMENTS } from '../../../domain/billing';
import { createServer } from '../server';
import { createMeRoutes } from './me.routes';

describe('subscription feature availability', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    const billingAccess = {
      getAccess: vi.fn().mockResolvedValue({
        plan: 'team',
        status: 'active',
        hasPaidAccess: true,
        entitlements: PLAN_ENTITLEMENTS.team,
        subscription: null,
      }),
    } as BillingAccessProvider;
    const app = createServer(
      [createMeRoutes({} as UsageRepository, billingAccess, false)],
      async (token) => token === 'valid-token' ? {
        id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
      } : null,
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  it('exposes the server-controlled in-room recording status', async () => {
    const response = await fetch(`${baseUrl}/api/me/subscription`, {
      headers: { cookie: 'session=valid-token' },
    });
    const body = await response.json() as { inRoomRecordingEnabled: boolean };

    expect(response.status).toBe(200);
    expect(body.inRoomRecordingEnabled).toBe(false);
  });
});
