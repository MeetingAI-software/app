import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import { FeatureUnavailableError } from '../../../domain/errors';
import type { MeetingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import type { AudioStoragePort } from '../../../ports/audio-storage.port';
import type { UsageMeterService } from '../../../application/usage-meter.service';
import { createServer } from '../server';
import { createUploadRoutes } from './upload.routes';
import { RECORDING_NOTICE_VERSION } from '../../../domain/recording-notice';

/** Passes the content sniffer: an EBML header, which is what a real WebM recording opens with. */
const WEBM_BYTES = (() => {
  const bytes = new Uint8Array(16);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
})();

describe('upload admission lifetime', () => {
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
    const meetingCreate = vi.fn().mockResolvedValue({ id: 'synthetic-upload' });
    const app = createServer([createUploadRoutes(
      { create: meetingCreate, setUploadInfo: vi.fn(), updateStatus } as never,
      { insertIfNew: enqueue } as never, { assertCanStartMeeting: vi.fn() } as never, storage,
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
      expect(meetingCreate).toHaveBeenCalledTimes(1);
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
  const assertCanStartMeeting = vi.fn();
  const meetingCreate = vi.fn();

  beforeAll(() => {
    assertCanStartMeeting.mockRejectedValue(
      new FeatureUnavailableError('In-room recording is not available in this environment'),
    );
    const route = createUploadRoutes(
      { create: meetingCreate } as unknown as MeetingRepository,
      {} as WebhookEventRepository,
      { assertCanStartMeeting } as unknown as UsageMeterService,
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
    assertCanStartMeeting.mockClear();
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
    expect(assertCanStartMeeting).not.toHaveBeenCalled();
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
      { assertCanStartMeeting: vi.fn().mockResolvedValue(undefined) } as unknown as UsageMeterService,
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
});

describe('in-room upload content validation', () => {
  let server: Server;
  let baseUrl: string;
  const assertCanStartMeeting = vi.fn();
  const meetingCreate = vi.fn();

  beforeAll(() => {
    const route = createUploadRoutes(
      { create: meetingCreate } as unknown as MeetingRepository,
      {} as WebhookEventRepository,
      { assertCanStartMeeting } as unknown as UsageMeterService,
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
    expect(assertCanStartMeeting).not.toHaveBeenCalled();
    expect(meetingCreate).not.toHaveBeenCalled();
  });
});
