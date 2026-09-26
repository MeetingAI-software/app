import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { request } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import { FeatureUnavailableError } from '../../../domain/errors';
import type { MeetingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import type { AudioStoragePort } from '../../../ports/audio-storage.port';
import type { UsageMeterService } from '../../../application/usage-meter.service';
import { createServer } from '../server';
import { createUploadRoutes as createUploadRoutesReal } from './upload.routes';
import { AudioDurationError, measureAudioDuration } from './audio-duration';
import { RECORDING_NOTICE_VERSION } from '../../../domain/recording-notice';

/** Passes the content sniffer: an EBML header, which is what a real WebM recording opens with. */
const WEBM_BYTES = (() => {
  const bytes = new Uint8Array(16);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
})();

// Legacy route tests exercise multipart, notice, storage and outbox behavior with a synthetic
// container header. Supply a measured duration; the real decoder has its own integration tests.
function createUploadRoutes(
  meetingRepo: MeetingRepository, webhookRepo: WebhookEventRepository,
  usageMeter: UsageMeterService, storage: AudioStoragePort,
  options: Parameters<typeof createUploadRoutesReal>[4] = {},
) {
  const meter = usageMeter as UsageMeterService & { getUploadMaxSeconds?: (id: string) => Promise<number> };
  meter.getUploadMaxSeconds ??= vi.fn().mockResolvedValue(86_400);
  return createUploadRoutesReal(meetingRepo, webhookRepo, usageMeter, storage, {
    ...options,
    inspectAudio: options.inspectAudio ?? (async () => 1) as typeof measureAudioDuration,
  });
}

describe('upload admission lifetime', () => {
  it('releases the upload slot when a client keeps a multipart body open', async () => {
    const storage = {
      upload: vi.fn().mockResolvedValue({ path: 'audio/valid.webm' }),
      delete: vi.fn(), getSignedUrl: vi.fn(),
    };
    const app = createServer([createUploadRoutes(
      { create: vi.fn().mockResolvedValue({ id: 'valid-upload' }), setUploadInfo: vi.fn() } as never,
      { insertIfNew: vi.fn() } as never,
      { reserveMeeting: vi.fn().mockResolvedValue({ meeting: { id: 'valid-upload' } }) } as never,
      storage,
      { parseTimeoutMs: 80 },
    )], async (token) => ({ id: token, email: 'synthetic@example.test', emailVerified: true, createdAt: new Date() }));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/meetings/upload`;
    const headers = {
      origin: config.WEB_ORIGIN, cookie: 'session=synthetic',
      'x-recording-notice-confirmed': 'true',
      'x-recording-notice-version': RECORDING_NOTICE_VERSION,
    };
    try {
      const disconnected = new Promise<void>((resolve) => {
        const slow = request(url, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'multipart/form-data; boundary=slow-boundary' },
        }, (response) => { response.resume(); response.once('end', resolve); });
        slow.once('error', () => resolve());
        slow.write('--slow-boundary\r\nContent-Disposition: form-data; name="audio"; filename="slow.webm"\r\nContent-Type: audio/webm\r\n\r\n');
      });
      await disconnected;
      const body = new FormData();
      body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'valid.webm');
      expect((await fetch(url, { method: 'POST', headers, body })).status).toBe(201);
      expect(storage.upload).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it.each(['resolve', 'reject'])('holds a disconnected upload through pending storage %s and cleanup', async (outcome) => {
    const originalLimit = config.MAX_CONCURRENT_UPLOADS;
    config.MAX_CONCURRENT_UPLOADS = 1;
    let settle!: (value: { path: string }) => void;
    let fail!: (error: Error) => void;
    const pending = new Promise<{ path: string }>((resolve, reject) => { settle = resolve; fail = reject; });
    const storage = { upload: vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ path: 'audio/next.webm' }),
      delete: vi.fn().mockResolvedValue(undefined), getSignedUrl: vi.fn() };
    const updateStatus = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const reserveMeeting = vi.fn().mockResolvedValue({ meeting: { id: 'synthetic-upload' } });
    const app = createServer([createUploadRoutes(
      { setUploadInfo: vi.fn(), updateStatus } as never,
      { insertIfNew: enqueue } as never,
      { reserveMeeting } as never, storage,
    )], async (token) => ({ id: token, email: 'synthetic@example.test', emailVerified: true, createdAt: new Date() }));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/meetings/upload`;
    const request = (id: string, signal?: AbortSignal) => {
      const body = new FormData();
      body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'synthetic.webm');
      return fetch(url, { method: 'POST', signal, body, headers: {
        origin: config.WEB_ORIGIN, cookie: `session=${id}`, 'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      } });
    };
    try {
      const controller = new AbortController();
      const first = request('first', controller.signal).catch(() => null);
      await vi.waitFor(() => expect(storage.upload).toHaveBeenCalledTimes(1));
      const forwarded = storage.upload.mock.calls[0][3].signal as AbortSignal;
      controller.abort();
      await first;
      await vi.waitFor(() => expect(forwarded.aborted).toBe(true));
      for (let i = 0; i < 3; i++) {
        const rejected = await request(`blocked-${i}`);
        expect(rejected.status).toBe(503);
        expect(rejected.headers.get('retry-after')).toBe('5');
        expect(await rejected.json()).toMatchObject({ error: { code: 'UPLOAD_CAPACITY_REACHED' } });
      }
      expect(reserveMeeting).toHaveBeenCalledTimes(1);
      if (outcome === 'resolve') settle({ path: 'audio/abandoned.webm' });
      else fail(new Error('synthetic storage failure'));
      await vi.waitFor(() => expect(updateStatus).toHaveBeenCalledTimes(1));
      expect(enqueue).not.toHaveBeenCalled();
      if (outcome === 'resolve') expect(storage.delete).toHaveBeenCalledWith('audio/abandoned.webm');
      expect((await request('next')).status).toBe(201);
      expect(enqueue).toHaveBeenCalledTimes(1);
    } finally {
      settle({ path: 'audio/abandoned.webm' });
      config.MAX_CONCURRENT_UPLOADS = originalLimit;
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

describe('in-room upload availability', () => {
  let server: Server;
  let baseUrl: string;
  const reserveMeeting = vi.fn();
  const meetingCreate = vi.fn();

  beforeAll(() => {
    reserveMeeting.mockRejectedValue(
      new FeatureUnavailableError('In-room recording is not available in this environment'),
    );
    const route = createUploadRoutes(
      { create: meetingCreate } as unknown as MeetingRepository,
      {} as WebhookEventRepository,
      { reserveMeeting } as unknown as UsageMeterService,
      {} as AudioStoragePort,
    );
    const app = createServer([route], async (token) => token === 'valid-token' ? {
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    } : null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  beforeEach(() => {
    reserveMeeting.mockClear();
    meetingCreate.mockClear();
  });

  it('rejects a direct upload before buffering when recording notice evidence is absent', async () => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    body.append('participantNames', '[]');

    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: { origin: config.WEB_ORIGIN, cookie: 'session=valid-token' },
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'RECORDING_NOTICE_REQUIRED' } });
    expect(reserveMeeting).not.toHaveBeenCalled();
    expect(meetingCreate).not.toHaveBeenCalled();
  });

  it('returns FEATURE_UNAVAILABLE before creating a meeting', async () => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    body.append('participantNames', '[]');

    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN,
        cookie: 'session=valid-token',
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      },
      body,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FEATURE_UNAVAILABLE',
        message: 'In-room recording is not available in this environment',
      },
    });
    expect(meetingCreate).not.toHaveBeenCalled();
  });

  it('deletes a stored object if persisting its reference fails', async () => {
    const storedMeeting = {
      id: 'meeting-orphan', ownerUserId: 'user-1', status: 'pending', source: 'upload',
      meetingUrl: null, platform: 'zoom', botId: null, durationSeconds: null, errorMessage: null,
      summary: null, shareToken: 'unused', participantNames: [], audioStoragePath: null,
      transcriptionJobId: null, createdAt: new Date(), updatedAt: new Date(),
    } as const;
    const updateStatus = vi.fn().mockResolvedValue(storedMeeting);
    const storage = {
      upload: vi.fn().mockResolvedValue({ path: 'meeting-orphan/audio.webm' }),
      getSignedUrl: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioStoragePort;
    const route = createUploadRoutes(
      {
        create: vi.fn().mockResolvedValue(storedMeeting),
        setUploadInfo: vi.fn().mockRejectedValue(new Error('database unavailable')),
        updateStatus,
      } as unknown as MeetingRepository,
      { insertIfNew: vi.fn() } as unknown as WebhookEventRepository,
      { reserveMeeting: vi.fn().mockResolvedValue({ meeting: storedMeeting }) } as unknown as UsageMeterService,
      storage,
    );
    const localServer = createServer([route], async () => ({
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    })).listen(0);
    const localBase = `http://127.0.0.1:${(localServer.address() as AddressInfo).port}`;

    try {
      const body = new FormData();
      body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
      body.append('participantNames', '[]');
      const response = await fetch(`${localBase}/api/meetings/upload`, {
        method: 'POST',
        headers: {
          origin: config.WEB_ORIGIN,
          cookie: 'session=valid-token',
          'x-recording-notice-confirmed': 'true',
          'x-recording-notice-version': RECORDING_NOTICE_VERSION,
        },
        body,
      });

      expect(response.status).toBe(500);
      expect(storage.delete).toHaveBeenCalledWith('meeting-orphan/audio.webm');
      expect(updateStatus).toHaveBeenCalledWith('meeting-orphan', 'failed', expect.any(Object));
    } finally {
      await new Promise<void>((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('retains audio and quota if the upload event insert might have committed', async () => {
    const meeting = { id: 'meeting-ambiguous' };
    const storage = { upload: vi.fn().mockResolvedValue({ path: 'audio/ambiguous.webm' }),
      delete: vi.fn() };
    const updateStatus = vi.fn();
    const route = createUploadRoutes(
      { setUploadInfo: vi.fn(), updateStatus } as never,
      { insertIfNew: vi.fn().mockRejectedValue(new Error('lost insert response')) } as never,
      { reserveMeeting: vi.fn().mockResolvedValue({ meeting }) } as never,
      storage as never,
    );
    const localServer = createServer([route], async () => ({
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    })).listen(0);
    try {
      const body = new FormData();
      body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
      const response = await fetch(`http://127.0.0.1:${(localServer.address() as AddressInfo).port}/api/meetings/upload`, {
        method: 'POST',
        headers: { origin: config.WEB_ORIGIN, cookie: 'session=valid-token',
          'x-recording-notice-confirmed': 'true',
          'x-recording-notice-version': RECORDING_NOTICE_VERSION },
        body,
      });
      expect(response.status).toBe(500);
      expect(storage.delete).not.toHaveBeenCalled();
      expect(updateStatus).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => localServer.close(() => resolve()));
    }
  });
});

describe('in-room upload content validation', () => {
  let server: Server;
  let baseUrl: string;
  const reserveMeeting = vi.fn();
  const meetingCreate = vi.fn();

  beforeAll(() => {
    const route = createUploadRoutes(
      { create: meetingCreate } as unknown as MeetingRepository,
      {} as WebhookEventRepository,
      { reserveMeeting } as unknown as UsageMeterService,
      {} as AudioStoragePort,
    );
    const app = createServer([route], async (token) => token === 'valid-token' ? {
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    } : null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  it('rejects a non-audio file that declares an audio Content-Type', async () => {
    const body = new FormData();
    // Both the MIME type and the filename are the caller's to choose; only the bytes are not.
    body.append('audio', new Blob(['<?php echo "not audio"; ?>'], { type: 'audio/webm' }), 'recording.webm');
    body.append('participantNames', '[]');

    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN,
        cookie: 'session=valid-token',
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      },
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INVALID_AUDIO',
        message: 'The uploaded file is not a recognised audio recording',
      },
    });
    // The reason sniffing runs before the meter: no meeting row, and nothing billable downstream.
    expect(reserveMeeting).not.toHaveBeenCalled();
    expect(meetingCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['sparse participant index', 'participantNames[999999999]', '[]'],
    ['unexpected scalar field', 'other', '[]'],
  ])('rejects %s before the usage meter', async (_name, field, value) => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    body.append(field, value);
    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN, cookie: 'session=valid-token',
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(reserveMeeting).not.toHaveBeenCalled();
    expect(meetingCreate).not.toHaveBeenCalled();
  });

  it('rejects repeated text fields before the usage meter', async () => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    body.append('participantNames', '[]');
    body.append('participantNames', '[]');
    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN, cookie: 'session=valid-token',
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(reserveMeeting).not.toHaveBeenCalled();
  });

  it('rejects an oversized participant field before parsing JSON or charging', async () => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    body.append('participantNames', 'x'.repeat(9000));
    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN, cookie: 'session=valid-token',
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(reserveMeeting).not.toHaveBeenCalled();
  });
});

describe('upload duration admission', () => {
  const send = async (server: Server) => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/meetings/upload`, {
      method: 'POST', body,
      headers: { origin: config.WEB_ORIGIN, cookie: 'session=verified',
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION },
    });
  };

  it.each([
    ['invalid', 400, 'INVALID_AUDIO'],
    ['too_long', 413, 'AUDIO_TOO_LONG'],
    ['unavailable', 503, 'AUDIO_INSPECTION_UNAVAILABLE'],
  ] as const)('rejects %s inspection before reservation or storage', async (reason, status, code) => {
    const reserveMeeting = vi.fn();
    const upload = vi.fn();
    const inspectAudio = vi.fn().mockRejectedValue(new AudioDurationError(reason));
    const route = createUploadRoutes({} as MeetingRepository, {} as WebhookEventRepository,
      { reserveMeeting, getUploadMaxSeconds: vi.fn().mockResolvedValue(2) } as unknown as UsageMeterService,
      { upload } as unknown as AudioStoragePort, { inspectAudio });
    const server = createServer([route], async () => ({
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    })).listen(0);
    try {
      const response = await send(server);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
      expect(reserveMeeting).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('reserves exactly the accepted decoded duration before storing audio', async () => {
    const reserveMeeting = vi.fn().mockResolvedValue({ meeting: { id: 'meeting-1' } });
    const upload = vi.fn().mockResolvedValue({ path: 'audio/recording.webm' });
    const inspectAudio = vi.fn().mockResolvedValue(2);
    const route = createUploadRoutes(
      { setUploadInfo: vi.fn() } as unknown as MeetingRepository,
      { insertIfNew: vi.fn() } as unknown as WebhookEventRepository,
      { reserveMeeting, getUploadMaxSeconds: vi.fn().mockResolvedValue(2) } as unknown as UsageMeterService,
      { upload } as unknown as AudioStoragePort, { inspectAudio },
    );
    const server = createServer([route], async () => ({
      id: 'user-1', email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    })).listen(0);
    try {
      expect((await send(server)).status).toBe(201);
      expect(inspectAudio).toHaveBeenCalledWith(expect.any(Buffer),
        { format: 'webm', mime: 'audio/webm' }, 2, expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(reserveMeeting).toHaveBeenCalledWith('user-1', 'upload',
        expect.objectContaining({ uploadDurationSeconds: 2 }));
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
