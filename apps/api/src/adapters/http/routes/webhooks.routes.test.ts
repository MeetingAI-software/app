import crypto from 'crypto';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import type { PaddleBillingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import { TRANSCRIPTION_WEBHOOK_HEADER } from '../../assemblyai/transcription-webhook.verifier';
import { createServer } from '../server';
import { createWebhookRoutes } from './webhooks.routes';

// ---------------------------------------------------------------------------
// The provider-facing doors. These sit outside /api, so neither the CSRF check
// nor the session gate protects them — a delivery proves itself by signature or
// shared secret, and nothing else stands behind it.
//
// Covered elsewhere and deliberately not repeated here:
//   /webhooks/paddle       → paddle-webhook.routes.test.ts
//   /webhooks/recall/live  → live-transcript.routes.test.ts
//
// What every accepted delivery must do is the same: land exactly one row in
// webhook_events under a STABLE external id, so a provider retry converges
// instead of transcribing (and billing for) the same meeting twice. The
// idempotency itself lives in the repository and is tested there; what these
// cases pin is that the route derives the key deterministically.
// ---------------------------------------------------------------------------

const RECALL_SECRET = `whsec_${Buffer.from('recall-key-material').toString('base64')}`;
const TRANSCRIPTION_SECRET = 'transcription-shared-secret';

function signRecall(body: string, id: string, timestamp: string): string {
  const secretBytes = Buffer.from(RECALL_SECRET.replace(/^whsec_/, ''), 'base64');
  return crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
}

describe('provider webhook routes', () => {
  const insertIfNew = vi.fn();
  let server: Server;
  let baseUrl: string;
  let previousProvider: typeof config.BOT_PROVIDER;
  let previousRecallSecret: string | undefined;
  let previousTranscriptionSecret: string | undefined;

  beforeAll(() => {
    previousProvider = config.BOT_PROVIDER;
    previousRecallSecret = config.RECALL_WEBHOOK_SECRET;
    previousTranscriptionSecret = config.TRANSCRIPTION_WEBHOOK_SECRET;
    config.TRANSCRIPTION_WEBHOOK_SECRET = TRANSCRIPTION_SECRET;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const webhookRepo = { insertIfNew } as unknown as WebhookEventRepository;
    const app = createServer(
      [createWebhookRoutes(webhookRepo, {} as PaddleBillingRepository)],
      async () => null,          // webhooks never carry a session
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    insertIfNew.mockReset();
    insertIfNew.mockResolvedValue(true);
    config.BOT_PROVIDER = previousProvider;
    config.RECALL_WEBHOOK_SECRET = previousRecallSecret;
    config.TRANSCRIPTION_WEBHOOK_SECRET = TRANSCRIPTION_SECRET;
  });

  afterAll(async () => {
    config.BOT_PROVIDER = previousProvider;
    config.RECALL_WEBHOOK_SECRET = previousRecallSecret;
    config.TRANSCRIPTION_WEBHOOK_SECRET = previousTranscriptionSecret;
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  function post(path: string, body: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
  }

  // -------------------------------------------------------------------------
  // AssemblyAI — the upload path. Guarded by a shared secret in a header.
  // -------------------------------------------------------------------------
  describe('POST /webhooks/transcription', () => {
    const body = JSON.stringify({ transcript_id: 'tr_123', status: 'completed' });

    it('accepts a correctly authenticated delivery and enqueues exactly one job', async () => {
      const response = await post('/webhooks/transcription', body, {
        [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
      expect(insertIfNew).toHaveBeenCalledTimes(1);
      expect(insertIfNew).toHaveBeenCalledWith({
        provider: 'assemblyai',
        externalEventId: 'tr_123',
        eventType: 'transcription_ready',
        payload: { jobId: 'tr_123', status: 'completed' },
      });
    });

    // Without this check anyone who learns the URL can announce that any transcript is ready, and
    // the worker will go and process it.
    it.each([
      ['no secret header at all', {}],
      ['the wrong secret', { [TRANSCRIPTION_WEBHOOK_HEADER]: 'not-the-secret' }],
      ['an empty secret', { [TRANSCRIPTION_WEBHOOK_HEADER]: '' }],
      // Both sides of the length guard. Header values are whitespace-trimmed in transit, so a
      // near-miss has to differ in an actual character to be worth asserting.
      ['a secret one character short', { [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET.slice(0, -1) }],
      ['a secret with one character too many', { [TRANSCRIPTION_WEBHOOK_HEADER]: `${TRANSCRIPTION_SECRET}x` }],
    ])('refuses a delivery with %s, and queues nothing', async (_label, headers) => {
      const response = await post('/webhooks/transcription', body, headers as Record<string, string>);

      expect(response.status).toBe(401);
      expect(insertIfNew).not.toHaveBeenCalled();
    });

    // Fails closed: if the secret were ever missing from the environment, the endpoint must reject
    // everything rather than fall open to the whole internet.
    it('refuses everything when no secret is configured on our side', async () => {
      config.TRANSCRIPTION_WEBHOOK_SECRET = undefined;

      const response = await post('/webhooks/transcription', body, {
        [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET,
      });

      expect(response.status).toBe(401);
      expect(insertIfNew).not.toHaveBeenCalled();
    });

    it('rejects an authenticated delivery that names no transcript', async () => {
      const response = await post('/webhooks/transcription', JSON.stringify({ status: 'completed' }), {
        [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Missing transcript_id' });
      expect(insertIfNew).not.toHaveBeenCalled();
    });

    // The transcript id IS the idempotency key. AssemblyAI retries until it gets a 200, so the same
    // delivery arriving three times must present the same key all three times — otherwise the
    // repository's unique index never fires and one upload is transcribed repeatedly.
    it('presents the same idempotency key on every retry of the same delivery', async () => {
      const headers = { [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET };
      insertIfNew.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

      await post('/webhooks/transcription', body, headers);
      await post('/webhooks/transcription', body, headers);
      await post('/webhooks/transcription', body, headers);

      const keys = insertIfNew.mock.calls.map(([event]) => event.externalEventId);
      expect(keys).toEqual(['tr_123', 'tr_123', 'tr_123']);
    });

    // A duplicate is still a success from the provider's point of view. Answering anything else
    // makes AssemblyAI retry a delivery that has already been handled, forever.
    it('acknowledges a duplicate rather than inviting another retry', async () => {
      insertIfNew.mockResolvedValue(false);

      const response = await post('/webhooks/transcription', body, {
        [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET,
      });

      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Recall — the bot path. Guarded by an HMAC over the raw body.
  // -------------------------------------------------------------------------
  describe('POST /webhooks/recall', () => {
    const payload = { event: 'transcript.done', data: { bot_id: 'bot-1' } };
    const body = JSON.stringify(payload);

    it('accepts a delivery and files it under the provider’s own event id', async () => {
      const response = await post('/webhooks/recall', body, { 'webhook-id': 'msg_abc' });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
      expect(insertIfNew).toHaveBeenCalledWith({
        provider: 'recall',
        externalEventId: 'msg_abc',
        eventType: 'transcript.done',
        payload,
      });
    });

    it('reads the svix-id spelling too', async () => {
      await post('/webhooks/recall', body, { 'svix-id': 'msg_xyz' });

      expect(insertIfNew.mock.calls[0][0].externalEventId).toBe('msg_xyz');
    });

    // No provider id means the body itself has to supply a stable key, or a retry would arrive
    // under a brand new id and be processed a second time.
    it('falls back to a fingerprint of the body when the provider sends no id', async () => {
      await post('/webhooks/recall', body);
      await post('/webhooks/recall', body);

      const [first, second] = insertIfNew.mock.calls.map(([event]) => event.externalEventId);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(second).toBe(first);
    });

    it('gives two genuinely different deliveries two different fingerprints', async () => {
      await post('/webhooks/recall', JSON.stringify({ event: 'transcript.done', data: { bot_id: 'bot-1' } }));
      await post('/webhooks/recall', JSON.stringify({ event: 'transcript.done', data: { bot_id: 'bot-2' } }));

      const [first, second] = insertIfNew.mock.calls.map(([event]) => event.externalEventId);
      expect(first).not.toBe(second);
    });

    it('defaults the event type when the body does not name one', async () => {
      await post('/webhooks/recall', JSON.stringify({ data: { bot_id: 'bot-1' } }), { 'webhook-id': 'msg_1' });

      expect(insertIfNew.mock.calls[0][0].eventType).toBe('transcript_ready');
    });

    describe('with the real Recall provider configured', () => {
      beforeEach(() => {
        config.BOT_PROVIDER = 'recall';
        config.RECALL_WEBHOOK_SECRET = RECALL_SECRET;
      });

      it('accepts a correctly signed delivery', async () => {
        const id = 'msg_signed';
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const response = await post('/webhooks/recall', body, {
          'webhook-id': id,
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${signRecall(body, id, timestamp)}`,
        });

        expect(response.status).toBe(200);
        expect(insertIfNew).toHaveBeenCalledTimes(1);
      });

      // THE test for this endpoint. An unsigned delivery is a stranger claiming a meeting finished.
      // It must be turned away before anything is written for the worker to pick up.
      it('refuses an unsigned delivery and writes nothing', async () => {
        const response = await post('/webhooks/recall', body, { 'webhook-id': 'msg_forged' });

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: 'Invalid signature' });
        expect(insertIfNew).not.toHaveBeenCalled();
      });

      it('refuses a delivery whose body was altered after signing', async () => {
        const id = 'msg_tampered';
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = signRecall(body, id, timestamp);
        const altered = JSON.stringify({ event: 'transcript.done', data: { bot_id: 'bot-999' } });

        const response = await post('/webhooks/recall', altered, {
          'webhook-id': id,
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${signature}`,
        });

        expect(response.status).toBe(401);
        expect(insertIfNew).not.toHaveBeenCalled();
      });
    });

    // Persistence failures must surface as a 5xx so Recall retries. Silently acknowledging one
    // loses the meeting: the delivery never comes again and no job was ever queued.
    it('does not acknowledge a delivery it failed to store', async () => {
      insertIfNew.mockRejectedValue(new Error('database unavailable'));

      const response = await post('/webhooks/recall', body, { 'webhook-id': 'msg_db_down' });

      expect(response.status).toBe(500);
    });
  });

  // These endpoints are reached by machines on the open internet, with no Origin header and no
  // session. Pinned because moving them under /api would break every provider at once.
  it('leaves both endpoints reachable without a session or an Origin header', async () => {
    const transcription = await post(
      '/webhooks/transcription',
      JSON.stringify({ transcript_id: 'tr_open', status: 'completed' }),
      { [TRANSCRIPTION_WEBHOOK_HEADER]: TRANSCRIPTION_SECRET },
    );
    const recall = await post('/webhooks/recall', JSON.stringify({ event: 'x' }), { 'webhook-id': 'msg_open' });

    expect(transcription.status).toBe(200);
    expect(recall.status).toBe(200);
  });
});
