import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import type { PaddleBillingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import { getPaddleClient } from '../../paddle/paddle-client';
import { processPaddleEvent } from '../../paddle/process-paddle-event';
import { createServer } from '../server';
import { createWebhookRoutes } from './webhooks.routes';

vi.mock('../../paddle/paddle-client', () => ({ getPaddleClient: vi.fn() }));
vi.mock('../../paddle/process-paddle-event', () => ({ processPaddleEvent: vi.fn() }));

describe('Paddle webhook route', () => {
  const unmarshal = vi.fn();
  let server: Server;
  let baseUrl: string;
  let previousSecret: string | undefined;

  beforeAll(() => {
    previousSecret = config.PADDLE_NOTIFICATION_WEBHOOK_SECRET;
    config.PADDLE_NOTIFICATION_WEBHOOK_SECRET = 'pdl_ntfset_test';
    vi.mocked(getPaddleClient).mockReturnValue({ webhooks: { unmarshal } } as never);

    const webhookRepo = {} as WebhookEventRepository;
    const billingRepo = {} as PaddleBillingRepository;
    const app = createServer([createWebhookRoutes(webhookRepo, billingRepo)], async () => null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    unmarshal.mockReset();
    vi.mocked(processPaddleEvent).mockReset();
  });

  afterAll(async () => {
    config.PADDLE_NOTIFICATION_WEBHOOK_SECRET = previousSecret;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  function post(body: string, signature?: string) {
    return fetch(`${baseUrl}/webhooks/paddle`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'paddle-signature': signature } : {}),
      },
      body,
    });
  }

  it('rejects requests without a Paddle signature', async () => {
    const response = await post('{"event_type":"customer.created"}');
    expect(response.status).toBe(400);
    expect(unmarshal).not.toHaveBeenCalled();
  });

  it('verifies the exact raw body and acknowledges a persisted event', async () => {
    const rawBody = '{ "event_type": "customer.created", "data": {"id":"ctm_1"} }';
    const event = { eventType: 'customer.created', data: { id: 'ctm_1' } };
    unmarshal.mockResolvedValue(event);

    const response = await post(rawBody, 'ts=1;h1=signature');

    expect(response.status).toBe(200);
    expect(unmarshal).toHaveBeenCalledWith(rawBody, 'pdl_ntfset_test', 'ts=1;h1=signature');
    expect(processPaddleEvent).toHaveBeenCalledWith(event, expect.anything());
  });

  it('returns a retryable error when verification fails', async () => {
    unmarshal.mockRejectedValue(new Error('invalid signature'));
    const response = await post('{}', 'ts=1;h1=bad');
    expect(response.status).toBe(500);
  });

  it('returns a retryable error when persistence fails', async () => {
    unmarshal.mockResolvedValue({ eventType: 'customer.updated', data: {} });
    vi.mocked(processPaddleEvent).mockRejectedValue(new Error('database unavailable'));
    const response = await post('{}', 'ts=1;h1=signature');
    expect(response.status).toBe(500);
  });

  it('acknowledges a replay so the idempotent resource upsert can converge', async () => {
    const event = {
      eventType: 'subscription.updated',
      eventId: 'evt_replayed',
      occurredAt: '2026-08-08T12:00:00Z',
      data: { id: 'sub_1' },
    };
    unmarshal.mockResolvedValue(event);

    const first = await post('{"event_id":"evt_replayed"}', 'ts=1;h1=signature');
    const replay = await post('{"event_id":"evt_replayed"}', 'ts=2;h1=signature');

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(processPaddleEvent).toHaveBeenNthCalledWith(1, event, expect.anything());
    expect(processPaddleEvent).toHaveBeenNthCalledWith(2, event, expect.anything());
  });
});
