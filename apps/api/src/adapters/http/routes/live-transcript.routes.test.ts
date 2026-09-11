import crypto from 'crypto';
import { ServerResponse, type Server } from 'http';
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
    shareEnabled: true,
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
    listSince: vi.fn(async (_id, after, limit = 500) => stored.filter(s => s.seq > after).slice(0, limit)),
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
      async (token) => token === 'good' ? OWNER
        : token.startsWith('synthetic-') ? { ...OWNER, id: token } : null,
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    current = meeting();
    stored = [];
    vi.mocked(meetingRepo.findById).mockReset().mockImplementation(async () => current);
    vi.mocked(meetingRepo.findByIdForUser).mockReset().mockImplementation(
      async (id, userId) => id === current.id && userId === current.ownerUserId ? current : null,
    );
    vi.mocked(liveRepo.listSince).mockReset().mockImplementation(
      async (_id, after, limit = 500) => stored.filter(segment => segment.seq > after).slice(0, limit),
    );
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
    it('enforces global admission before DB and retains aborted ownership queries until settlement', async () => {
      const settle: Array<(value: Meeting | null) => void> = [];
      vi.mocked(meetingRepo.findByIdForUser).mockImplementation(() => new Promise(resolve => { settle.push(resolve); }));
      const controllers = Array.from({ length: config.MAX_LIVE_STREAM_CONNECTIONS }, () => new AbortController());
      const pending = controllers.map((controller, i) => asOwner('/api/meetings/m1/live/stream', {
        signal: controller.signal, headers: { cookie: `session=synthetic-${i}` },
      }).catch(() => null));
      try {
        await vi.waitFor(() => expect(settle).toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS));
        controllers.forEach(controller => controller.abort());
        await Promise.all(pending);
        const blocked = await asOwner('/api/meetings/m1/live/stream');
        expect(blocked.status).toBe(503);
        expect(blocked.headers.get('retry-after')).toBe('5');
        expect((await blocked.json()).error.code).toBe('LIVE_STREAM_CAPACITY_REACHED');
        expect(settle).toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS);
      } finally {
        controllers.forEach(controller => controller.abort());
        settle.forEach(resolve => resolve(null));
        await Promise.all(pending);
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      vi.mocked(meetingRepo.findByIdForUser).mockResolvedValue(null);
      expect((await asOwner('/api/meetings/m1/live/stream')).status).toBe(404);
    });

    it('closes a socket waiting for replay on shutdown and retains its pending query slot', async () => {
      let settle: ((rows: typeof stored) => void) | undefined;
      vi.mocked(liveRepo.listSince).mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
      const response = await asOwner('/api/meetings/m1/live/stream');
      const body = response.text().catch(() => 'closed');
      await vi.waitFor(() => expect(settle).toBeDefined());
      bus.shutdown();
      await expect(body).resolves.toBe('closed');
      expect(bus.subscriberCount('m1')).toBe(0);
      settle?.([]);
      await new Promise<void>(resolve => setImmediate(resolve));
    });

    it('runs at most one heartbeat query and holds capacity until an aborted query settles', async () => {
      const intervals = vi.spyOn(globalThis, 'setInterval');
      let settle: ((value: Meeting) => void) | undefined;
      vi.mocked(meetingRepo.findById).mockImplementation(() => new Promise(resolve => { settle = resolve; }));
      const response = await asOwner('/api/meetings/m1/live/stream');
      try {
        await vi.waitFor(() => expect(intervals.mock.calls.some(call => call[1] === 15000)).toBe(true));
        const tick = intervals.mock.calls.find(call => call[1] === 15000)![0] as () => void;
        tick(); tick(); tick();
        expect(meetingRepo.findById).toHaveBeenCalledTimes(1);
        await response.body?.cancel();
        await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
        tick();
        expect(meetingRepo.findById).toHaveBeenCalledTimes(1);
      } finally {
        settle?.(current);
        intervals.mockRestore();
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    });

    it('bounds live backpressure and replays the unsent durable segment after reconnect', async () => {
      const originalWrite = ServerResponse.prototype.write;
      let blockedResponse: ServerResponse | undefined;
      const write = vi.spyOn(ServerResponse.prototype, 'write').mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse['write']>) {
        const accepted = Reflect.apply(originalWrite, this, args) as boolean;
        if (this.getHeader('content-type') === 'text/event-stream' && String(args[0]).includes('event: segment')) {
          blockedResponse = this;
          return false;
        }
        return accepted;
      });
      const response = await asOwner('/api/meetings/m1/live/stream');
      const reader = response.body!.getReader();
      try {
        const first = { seq: 1, startMs: 0, endMs: 1, speaker: 'Test', text: 'first durable' };
        const second = { ...first, seq: 2, text: 'second durable' };
        stored.push(first);
        bus.publish('m1', { type: 'segment', segment: first });
        expect(new TextDecoder().decode((await reader.read()).value)).toContain('id: 1');
        stored.push(second);
        bus.publish('m1', { type: 'segment', segment: second });
        await expect(reader.read()).rejects.toThrow();
        await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
        expect(blockedResponse?.listenerCount('drain')).toBe(0);
        write.mockRestore();
        current = meeting({ status: 'transcribed' });
        const reconnect = await asOwner('/api/meetings/m1/live/stream', { headers: { 'last-event-id': '1' } });
        const replay = await reconnect.text();
        expect(replay).toContain('second durable');
        expect(replay).not.toContain('first durable');
      } finally {
        write.mockRestore();
        await reader.cancel().catch(() => undefined);
      }
    });

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
      await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
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
      await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
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

    it('waits for response drain instead of truncating a large legitimate replay', async () => {
      stored = Array.from({ length: 250 }, (_, index) => ({
        seq: index + 1,
        startMs: index * 1000,
        endMs: (index + 1) * 1000,
        speaker: 'Ada',
        text: `segment-${index + 1}-${'x'.repeat(2048)}`,
      }));
      current = meeting({ status: 'transcribed' });

      const res = await asOwner('/api/meetings/m1/live/stream');
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(body.match(/event: segment/g)).toHaveLength(250);
      expect(body).toContain('id: 250');
      expect(vi.mocked(liveRepo.listSince).mock.calls.map(call => call[1])).toEqual([0, 100, 200]);
      expect(body).toContain('event: done');
    });

    it('catches persisted segments published while replay is still in progress', async () => {
      let settleFirstReplay: ((segments: typeof stored) => void) | undefined;
      vi.mocked(liveRepo.listSince).mockImplementationOnce(() => new Promise(resolve => {
        settleFirstReplay = resolve;
      }));

      const response = await asOwner('/api/meetings/m1/live/stream');
      await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(1));

      const segment = {
        seq: 1,
        startMs: 0,
        endMs: 1000,
        speaker: 'Ada',
        text: 'published-during-replay',
      };
      stored.push(segment);
      bus.publish('m1', { type: 'segment', segment });
      bus.publish('m1', { type: 'done', status: 'transcribed' });
      settleFirstReplay?.([]);

      const body = await response.text();
      expect(body.match(/published-during-replay/g)).toHaveLength(1);
      expect(body).toContain('id: 1');
      expect(body).toContain('event: done');
      await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
    });

    it('bounds requests before a pending ownership lookup can allocate unbounded DB work', async () => {
      const settleOwnership: Array<(value: Meeting | null) => void> = [];
      vi.mocked(meetingRepo.findByIdForUser).mockImplementation(() => new Promise(resolve => {
        settleOwnership.push(resolve);
      }));
      const pending = Array.from(
        { length: config.MAX_LIVE_STREAM_CONNECTIONS_PER_USER },
        () => asOwner('/api/meetings/m1/live/stream'),
      );

      await vi.waitFor(() => {
        expect(vi.mocked(meetingRepo.findByIdForUser).mock.calls)
          .toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS_PER_USER);
      });
      const blocked = await asOwner('/api/meetings/m1/live/stream');
      expect(blocked.status).toBe(429);
      expect(vi.mocked(meetingRepo.findByIdForUser).mock.calls)
        .toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS_PER_USER);

      settleOwnership.forEach(resolve => resolve(current));
      const responses = await Promise.all(pending);
      const accepted = responses.filter(response => response.status === 200);
      expect(accepted).toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING);
      expect(responses.filter(response => response.status === 429))
        .toHaveLength(
          config.MAX_LIVE_STREAM_CONNECTIONS_PER_USER
          - config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING,
        );
      await Promise.all(accepted.map(response => response.body?.cancel()));
      await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
    });

    it('bounds simultaneous streams before replay and returns a slot after disconnect', async () => {
      const accepted: Response[] = [];
      let replacement: Response | undefined;
      const callsBefore = vi.mocked(liveRepo.listSince).mock.calls.length;

      try {
        for (let i = 0; i < config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING; i += 1) {
          accepted.push(await asOwner('/api/meetings/m1/live/stream'));
        }
        expect(accepted.every(response => response.status === 200)).toBe(true);
        await vi.waitFor(() => {
          expect(bus.subscriberCount('m1')).toBe(config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING);
        });

        const blocked = await asOwner('/api/meetings/m1/live/stream');
        expect(blocked.status).toBe(429);
        await expect(blocked.json()).resolves.toEqual({
          error: {
            code: 'LIVE_STREAM_LIMIT_REACHED',
            message: 'Too many concurrent live transcript streams',
          },
        });
        expect(blocked.headers.get('retry-after')).toBe('5');
        expect(vi.mocked(liveRepo.listSince).mock.calls.length)
          .toBe(callsBefore + config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING);

        // Express also dispatches HEAD through this GET handler; it must hit the same gate.
        expect((await asOwner('/api/meetings/m1/live/stream', { method: 'HEAD' })).status).toBe(429);

        // Terminal replay still owns a socket, result rows, and database work, so it cannot bypass
        // the same occupancy boundary while all meeting slots are full.
        current = meeting({ status: 'transcribed' });
        const terminalBlocked = await asOwner('/api/meetings/m1/live/stream');
        expect(terminalBlocked.status).toBe(429);

        await accepted[0].body?.cancel();
        await vi.waitFor(() => {
          expect(bus.subscriberCount('m1')).toBe(config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING - 1);
        });

        const terminal = await asOwner('/api/meetings/m1/live/stream');
        expect(terminal.status).toBe(200);
        expect(await terminal.text()).toContain('event: done');

        current = meeting();
        replacement = await asOwner('/api/meetings/m1/live/stream');
        expect(replacement.status).toBe(200);
      } finally {
        await Promise.all(accepted.map(response => response.body?.cancel()));
        await replacement?.body?.cancel();
        await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
      }
    });

    it('bounds concurrent terminal replays and releases their slots after completion', async () => {
      current = meeting({ status: 'transcribed' });
      const settleReplay: Array<() => void> = [];
      vi.mocked(liveRepo.listSince).mockImplementation(() => new Promise(resolve => {
        settleReplay.push(() => resolve([{
          seq: 1,
          startMs: 0,
          endMs: 1000,
          speaker: 'Ada',
          text: 'final segment',
        }]));
      }));
      const accepted: Response[] = [];

      try {
        for (let i = 0; i < config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING; i += 1) {
          accepted.push(await asOwner('/api/meetings/m1/live/stream'));
        }
        expect(settleReplay).toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING);

        const blocked = await asOwner('/api/meetings/m1/live/stream');
        expect(blocked.status).toBe(429);
        expect(settleReplay).toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING);

        vi.mocked(liveRepo.listSince).mockImplementation(
          async (_id, after) => stored.filter(segment => segment.seq > after),
        );
        settleReplay.forEach(settle => settle());
        for (const response of accepted) {
          const body = await response.text();
          expect(body).toContain('event: segment');
          expect(body).toContain('event: done');
        }

        const replacement = await asOwner('/api/meetings/m1/live/stream');
        expect(replacement.status).toBe(200);
        expect(await replacement.text()).toContain('event: done');
      } finally {
        settleReplay.forEach(settle => settle());
        await Promise.all(accepted
          .filter(response => !response.bodyUsed)
          .map(response => response.body?.cancel()));
      }
    });

    it('releases an acquired slot when replay fails', async () => {
      vi.mocked(liveRepo.listSince).mockRejectedValueOnce(new Error('database unavailable'));
      const failed = await asOwner('/api/meetings/m1/live/stream');
      // SSE headers are committed before replay in the existing protocol, so the wire status is
      // already 200; the failed response body closes instead of retaining its capacity slot.
      expect(failed.status).toBe(200);
      await expect(failed.text()).rejects.toThrow();

      const accepted: Response[] = [];
      try {
        for (let i = 0; i < config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING; i += 1) {
          accepted.push(await asOwner('/api/meetings/m1/live/stream'));
        }
        expect(accepted.every(response => response.status === 200)).toBe(true);
      } finally {
        await Promise.all(accepted.map(response => response.body?.cancel()));
        await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
      }
    });

    it('holds disconnected slots until their pending replay queries settle', async () => {
      const settleReplay: Array<() => void> = [];
      vi.mocked(liveRepo.listSince).mockImplementation(() => new Promise(resolve => {
        settleReplay.push(() => resolve([]));
      }));
      const disconnected: Response[] = [];
      let blocked: Response | undefined;
      let replacement: Response | undefined;

      try {
        for (let i = 0; i < config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING; i += 1) {
          disconnected.push(await asOwner('/api/meetings/m1/live/stream'));
        }
        await Promise.all(disconnected.map(response => response.body?.cancel()));
        await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));

        // The sockets are gone, but their uncancellable database work still occupies the slots.
        blocked = await asOwner('/api/meetings/m1/live/stream');
        expect(blocked.status).toBe(429);
        expect(settleReplay).toHaveLength(config.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING);

        vi.mocked(liveRepo.listSince).mockImplementation(
          async (_id, after) => stored.filter(segment => segment.seq > after),
        );
        settleReplay.forEach(settle => settle());
        await new Promise<void>(resolve => setImmediate(resolve));

        replacement = await asOwner('/api/meetings/m1/live/stream');
        expect(replacement.status).toBe(200);
      } finally {
        settleReplay.forEach(settle => settle());
        await blocked?.body?.cancel();
        await replacement?.body?.cancel();
        await vi.waitFor(() => expect(bus.subscriberCount('m1')).toBe(0));
      }
    });
  });
});
