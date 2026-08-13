import crypto from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../config/env';
import { verifyWebhookSignature } from './recall-webhook.verifier';

// ---------------------------------------------------------------------------
// This is the only thing standing between "Recall says the meeting finished"
// and "anybody on the internet says the meeting finished". A forged delivery
// would be written straight into webhook_events and processed by the worker as
// if it were genuine.
//
// The suite has to opt in to real verification: test-setup.ts sets
// BOT_PROVIDER='fake', and the verifier short-circuits to `true` under fake so
// local simulated webhooks work. Every case below therefore sets the provider
// explicitly and restores it afterwards.
//
// The expected signature is recomputed here with the same algorithm rather than
// hard-coded, so the cases stay readable. That still catches a changed secret
// handling, a changed signed-content composition, a dropped body, or a broken
// comparison — each of those makes this file's expectation and the source
// disagree.
// ---------------------------------------------------------------------------

const SECRET = `whsec_${Buffer.from('recall-webhook-key-material').toString('base64')}`;
const ATTACKER_SECRET = `whsec_${Buffer.from('a-completely-different-key').toString('base64')}`;

const ID = 'msg_2abcdef';
const TIMESTAMP = '1786600000';
const BODY = JSON.stringify({ event: 'transcript.done', data: { bot_id: 'bot-1' } });

function sign(
  body: string,
  { id = ID, timestamp = TIMESTAMP, secret = SECRET }: { id?: string; timestamp?: string; secret?: string } = {},
): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
}

/** Shape of the express request the verifier reads: headers plus the captured raw body. */
function delivery(headers: Record<string, string | undefined>, body: string | null = BODY) {
  return { headers, ...(body === null ? {} : { rawBody: Buffer.from(body, 'utf8') }) };
}

function signedDelivery(body = BODY) {
  return delivery({
    'webhook-id': ID,
    'webhook-timestamp': TIMESTAMP,
    'webhook-signature': `v1,${sign(body)}`,
  }, body);
}

describe('verifyWebhookSignature', () => {
  let previousProvider: typeof config.BOT_PROVIDER;
  let previousSecret: string | undefined;

  beforeAll(() => {
    previousProvider = config.BOT_PROVIDER;
    previousSecret = config.RECALL_WEBHOOK_SECRET;
    // The verifier narrates every rejection; the suite asserts return values, not console noise.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    config.BOT_PROVIDER = previousProvider;
    config.RECALL_WEBHOOK_SECRET = previousSecret;
    vi.restoreAllMocks();
  });

  describe('with the fake bot provider', () => {
    beforeEach(() => {
      config.BOT_PROVIDER = 'fake';
      config.RECALL_WEBHOOK_SECRET = undefined;
    });

    // Deliberate: local development posts simulated webhooks by hand and cannot sign them. Pinned
    // so the bypass stays tied to BOT_PROVIDER — the one switch that is 'recall' in production.
    it('accepts anything, because nothing local can sign a request', () => {
      expect(verifyWebhookSignature(delivery({}))).toBe(true);
      expect(verifyWebhookSignature(delivery({ 'webhook-signature': 'v1,rubbish' }))).toBe(true);
    });
  });

  describe('with the real Recall provider', () => {
    beforeEach(() => {
      config.BOT_PROVIDER = 'recall';
      config.RECALL_WEBHOOK_SECRET = SECRET;
    });

    it('accepts a correctly signed delivery', () => {
      expect(verifyWebhookSignature(signedDelivery())).toBe(true);
    });

    it('accepts a signature sent without the v1 prefix', () => {
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': sign(BODY),
      });

      expect(verifyWebhookSignature(req)).toBe(true);
    });

    // Svix renamed its headers; Recall may send either spelling. Both are read, so a rename on
    // their side does not silently start rejecting every delivery.
    it('reads the svix-* header spellings as well as webhook-*', () => {
      const req = delivery({
        'svix-id': ID,
        'svix-timestamp': TIMESTAMP,
        'svix-signature': `v1,${sign(BODY)}`,
      });

      expect(verifyWebhookSignature(req)).toBe(true);
    });

    // THE test. The body is part of what gets signed, so a delivery whose contents were altered in
    // flight — a different bot_id, a different meeting — no longer matches.
    it('rejects a delivery whose body was altered after signing', () => {
      const tampered = JSON.stringify({ event: 'transcript.done', data: { bot_id: 'bot-999' } });
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY)}`,          // signed over the ORIGINAL body
      }, tampered);

      expect(verifyWebhookSignature(req)).toBe(false);
    });

    it('rejects a delivery signed with somebody else’s key', () => {
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY, { secret: ATTACKER_SECRET })}`,
      });

      expect(verifyWebhookSignature(req)).toBe(false);
    });

    // The id and the timestamp are inside the signed content too, so neither can be swapped while
    // keeping a signature that was issued for different values.
    it('rejects a delivery whose id or timestamp was swapped', () => {
      const swappedId = delivery({
        'webhook-id': 'msg_someone_elses',
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY)}`,
      });
      const swappedTimestamp = delivery({
        'webhook-id': ID,
        'webhook-timestamp': '1700000000',
        'webhook-signature': `v1,${sign(BODY)}`,
      });

      expect(verifyWebhookSignature(swappedId)).toBe(false);
      expect(verifyWebhookSignature(swappedTimestamp)).toBe(false);
    });

    it.each([
      ['webhook-id'],
      ['webhook-timestamp'],
      ['webhook-signature'],
    ])('rejects a delivery missing %s', (missing) => {
      const headers: Record<string, string | undefined> = {
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY)}`,
      };
      delete headers[missing];

      expect(verifyWebhookSignature(delivery(headers))).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      config.RECALL_WEBHOOK_SECRET = undefined;

      expect(verifyWebhookSignature(signedDelivery())).toBe(false);
    });

    // Raw body capture is a separate concern (server.ts:104). If it ever stopped populating,
    // verification must fail closed rather than quietly signing the empty string.
    it('rejects a delivery whose raw body was never captured', () => {
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY)}`,
      }, null);

      expect(verifyWebhookSignature(req)).toBe(false);
    });

    // Svix sends a space-separated list during key rotation: old key and new key both present.
    it('accepts a rotation list where one of the signatures is ours', () => {
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY, { secret: ATTACKER_SECRET })} v1,${sign(BODY)}`,
      });

      expect(verifyWebhookSignature(req)).toBe(true);
    });

    it('rejects a list in which none of the signatures is ours', () => {
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': `v1,${sign(BODY, { secret: ATTACKER_SECRET })} v1,${sign('{}', { secret: ATTACKER_SECRET })}`,
      });

      expect(verifyWebhookSignature(req)).toBe(false);
    });

    // Garbage must come back false, not throw. An exception here escapes into the route and turns
    // a rejected forgery into a 500 — which Recall would retry, forever.
    it.each([
      ['not-base-64-at-all-!!!'],
      ['v1,'],
      ['v1,c2hvcnQ='],
    ])('rejects the malformed signature %s without throwing', (signature) => {
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': TIMESTAMP,
        'webhook-signature': signature,
      });

      expect(() => verifyWebhookSignature(req)).not.toThrow();
      expect(verifyWebhookSignature(req)).toBe(false);
    });

    // KNOWN GAP, pinned rather than fixed. The timestamp is read into the signed content but its
    // age is never checked, so there is no replay window: a delivery captured today still verifies
    // in a year. What actually absorbs a replay today is webhook_events.external_event_id being
    // unique (webhook-event.repository.test.ts) — the second copy is discarded before processing.
    // Closing this properly means a freshness check in the verifier, which is a runtime change and
    // deliberately out of scope here.
    it('does not check how old a delivery is — replay is absorbed downstream, not here', () => {
      const ancient = '1500000000';                       // July 2017
      const req = delivery({
        'webhook-id': ID,
        'webhook-timestamp': ancient,
        'webhook-signature': `v1,${sign(BODY, { timestamp: ancient })}`,
      });

      expect(verifyWebhookSignature(req)).toBe(true);
    });
  });
});
