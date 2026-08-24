import crypto from 'crypto';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import type {
  DocumentRepository,
  LiveTranscriptRepository,
  MeetingRepository,
  PaddleBillingRepository,
  TranscriptRepository,
  WebhookEventRepository,
} from '../../../ports/repositories.port';
import type { StartMeetingService } from '../../../application/start-meeting.service';
import type { DocumentGeneratorPort } from '../../../ports/document-generator.port';
import { IngestLiveTranscriptService } from '../../../application/ingest-live-transcript.service';
import { LiveTranscriptBus } from '../../realtime/live-transcript.bus';
import type { Meeting, MeetingStatus, User } from '../../../domain/types';
import { createServer } from '../server';
import { createMeetingRoutes } from './meetings.routes';
import { createWebhookRoutes } from './webhooks.routes';

const OWNER: User = { id: 'u1', email: 'a@b.com', emailVerified: true, createdAt: new Date() };
const LIVE_SECRET = `whsec_${Buffer.from('live-webhook-key-material').toString('base64')}`;

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: 'https://us02web.zoom.us/j/1',
    platform: 'zoom',
    status: 'recording' as MeetingStatus,
    source: 'bot',
    botId: 'bot-1',
    ownerUserId: 'u1',
    durationSeconds: null,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-01T09:00:00Z'),
    ...overrides,
  };
}

describe('live transcript routes', () => {
  let server: Server;
  let baseUrl: string;
  let previousSecret: string | undefined;
  let current: Meeting;
  let stored: Array<{ seq: number; startMs: number; endMs: number; speaker: string; text: string }>;
  let bus: LiveTranscriptBus;

  const meetingRepo = {
    findById: vi.fn(async () => current),
    findByIdForUser: vi.fn(async (id: string, userId: string) =>
      id === current.id && userId === current.ownerUserId ? current : null),
    findByBotId: vi.fn(async () => current),
    updateStatus: vi.fn(async () => current),
  } as unknown as MeetingRepository;

  const liveRepo: LiveTranscriptRepository = {
    append: vi.fn(async (_id, seg) => {
      const row = { seq: stored.length + 1, ...seg };
      stored.push(row);
      return row;
    }),
    listSince: vi.fn(async (_id, after) => stored.filter(s => s.seq > after)),
    deleteByMeeting: vi.fn(),
  };

  beforeAll(() => {
    previousSecret = config.RECALL_REALTIME_WEBHOOK_SECRET;
    config.RECALL_REALTIME_WEBHOOK_SECRET = LIVE_SECRET;

    bus = new LiveTranscriptBus();
    const ingest = new IngestLiveTranscriptService(meetingRepo, liveRepo, bus);

    const app = createServer(
      [
        createMeetingRoutes(
          meetingRepo,
          {} as TranscriptRepository,
          {} as DocumentRepository,
          {} as StartMeetingService,
          {} as DocumentGeneratorPort,
          liveRepo,
          bus,
        ),
        createWebhookRoutes({} as WebhookEventRepository, {} as PaddleBillingRepository, ingest),
      ],
      // Any session token authenticates as the owner; ownership is what these tests exercise.
      async (token) => (token === 'good' ? OWNER : null),
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    current = meeting();
    stored = [];
  });

  afterAll(async () => {
    config.RECALL_REALTIME_WEBHOOK_SECRET = previousSecret;
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  const asOwner = (path: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${path}`, { ...init, headers: { cookie: 'session=good', ...(init.headers ?? {}) } });

  describe('POST /webhooks/recall/live', () => {
    const payload = {
      event: 'transcript.data',
      data: {
        data: {
          words: [{ text: 'hello', start_timestamp: { relative: 1 }, end_timestamp: { relative: 2 } }],
          participant: { id: 7, name: 'Ada' },
        },
        bot: { id: 'bot-1' },
      },
    };

    const post = (secret: string | null) => {
      const body = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const id = `live-${crypto.randomUUID()}`;
      const signature = secret
        ? crypto.createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
          .update(`${id}.${timestamp}.${body}`).digest('base64')
        : null;
      return fetch(`${baseUrl}/webhooks/recall/live`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature ? {
            'webhook-id': id,
            'webhook-timestamp': timestamp,
            'webhook-signature': `v1,${signature}`,
          } : {}),
        },
        body,
      });
    };

    it('rejects a missing or wrong token', async () => {
      expect((await post(null)).status).toBe(401);
      const wrongSecret = `whsec_${Buffer.from('wrong-key-material').toString('base64')}`;
      expect((await post(wrongSecret)).status).toBe(401);
      expect(stored).toHaveLength(0);
    });

    it('accepts a valid token and ingests the utterance', async () => {
      const res = await post(LIVE_SECRET);
      expect(res.status).toBe(200);

      // The route acknowledges before processing, so give the ingest a tick to land.
      await vi.waitFor(() => expect(stored).toHaveLength(1));
      expect(stored[0]).toMatchObject({ seq: 1, speaker: 'Ada', text: 'hello', startMs: 1000, endMs: 2000 });
    });
  });

  describe('GET /api/meetings/:id/live', () => {
    it('returns segments after the cursor', async () => {
      stored = [
        { seq: 1, startMs: 0, endMs: 1000, speaker: 'Ada', text: 'one' },
        { seq: 2, startMs: 1000, endMs: 2000, speaker: 'Ada', text: 'two' },
      ];

      const body = await (await asOwner('/api/meetings/m1/live?after=1')).json();
      expect(body.segments.map((s: { text: string }) => s.text)).toEqual(['two']);
      expect(body.cursor).toBe(2);
      expect(body.status).toBe('recording');
    });

    it('keeps the caller\'s cursor when nothing new has arrived', async () => {
      stored = [{ seq: 1, startMs: 0, endMs: 1, speaker: 'Ada', text: 'one' }];
      const body = await (await asOwner('/api/meetings/m1/live?after=1')).json();
      expect(body.segments).toEqual([]);
      expect(body.cursor).toBe(1);
    });

    it('404s for someone else\'s meeting', async () => {
      const res = await fetch(`${baseUrl}/api/meetings/m1/live`, { headers: { cookie: 'session=nobody' } });
      // No session at all is a 401 from requireUser; a valid session for a non-owner is the 404.
      expect(res.status).toBe(401);

      current = meeting({ ownerUserId: 'someone-else' });
      expect((await asOwner('/api/meetings/m1/live')).status).toBe(404);
    });
  });

  describe('GET /api/meetings/:id/live/stream', () => {
    it('replays stored segments then streams new ones, closing on done', async () => {
      stored = [{ seq: 1, startMs: 0, endMs: 1000, speaker: 'Ada', text: 'replayed' }];

      const res = await asOwner('/api/meetings/m1/live/stream');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toContain('no-transform');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const readUntil = async (marker: string) => {
        while (!buffer.includes(marker)) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      };

      await readUntil('replayed');
      // The `id:` line is what EventSource echoes back as Last-Event-ID on reconnect.
      expect(buffer).toContain('id: 1');
      expect(buffer).toContain('event: segment');

      bus.publish('m1', {
        type: 'segment',
        segment: { seq: 2, startMs: 1000, endMs: 2000, speaker: 'Ada', text: 'streamed' },
      });
      await readUntil('streamed');

      bus.publish('m1', { type: 'partial', speaker: 'Ada', text: 'in-fli' });
      await readUntil('in-fli');
      expect(buffer).toContain('event: partial');

      bus.publish('m1', { type: 'done', status: 'transcribed' });
      await readUntil('event: done');

      // The server ends the response itself; the client does not have to close it.
      const tail = await reader.read();
      expect(tail.done).toBe(true);
    });

    it('releases the connection on shutdown so a deploy is not blocked', async () => {
      const res = await asOwner('/api/meetings/m1/live/stream');
      const reader = res.body!.getReader();

      // Read one broadcast frame first. The handler registers its shutdown hook immediately
      // after subscribing to the bus, so receiving this proves the hook is in place.
      bus.publish('m1', {
        type: 'segment',
        segment: { seq: 1, startMs: 0, endMs: 1, speaker: 'Ada', text: 'talking' },
      });
      await reader.read();

      bus.shutdown();

      // The stream signs off with a `done` frame and then closes. Without the close,
      // server.close() would wait on this socket forever and every deploy would hang until the
      // platform SIGKILLed the process mid-webhook.
      let farewell = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        farewell += new TextDecoder().decode(value);
      }
      expect(farewell).toContain('event: done');
    });

    it('replays only what the client has not seen, from Last-Event-ID', async () => {
      stored = [
        { seq: 1, startMs: 0, endMs: 1, speaker: 'Ada', text: 'already-seen' },
        { seq: 2, startMs: 1, endMs: 2, speaker: 'Ada', text: 'missed-this' },
      ];
      current = meeting({ status: 'transcribed' }); // terminal → replay, then end immediately

      const res = await asOwner('/api/meetings/m1/live/stream', { headers: { 'last-event-id': '1' } });
      const body = await res.text();

      expect(body).not.toContain('already-seen');
      expect(body).toContain('missed-this');
      expect(body).toContain('event: done');
    });
  });
});
