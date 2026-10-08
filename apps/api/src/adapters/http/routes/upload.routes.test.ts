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
import { MAX_PARTICIPANT_NAMES } from './upload-inputs';

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


describe('in-room multipart parser security', () => {
  let server: Server;
  let baseUrl: string;
  let requestNumber = 0;
  const originalUploadLimit = config.MAX_UPLOAD_MB;
  const meeting = { id: 'security-test-meeting', source: 'upload', status: 'pending' };
  const meetingCreate = vi.fn().mockResolvedValue(meeting);
  const setUploadInfo = vi.fn().mockResolvedValue(undefined);
  const assertCanStartMeeting = vi.fn().mockResolvedValue(undefined);
  const uploadAudio = vi.fn().mockResolvedValue({ path: 'recordings/security-test.webm' });
  const insertIfNew = vi.fn().mockResolvedValue(true);

  beforeAll(() => {
    config.MAX_UPLOAD_MB = 1;
    const route = createUploadRoutes(
      { create: meetingCreate, setUploadInfo } as unknown as MeetingRepository,
      { insertIfNew } as unknown as WebhookEventRepository,
      { assertCanStartMeeting } as unknown as UsageMeterService,
      { upload: uploadAudio } as unknown as AudioStoragePort,
    );
    const app = createServer([route], async (token) => ({
      id: token, email: 'person@example.com', emailVerified: true, createdAt: new Date(),
    }));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(() => {
    config.MAX_UPLOAD_MB = originalUploadLimit;
    return new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  function audioForm(bytes: Uint8Array = WEBM_BYTES, mime = 'audio/webm'): FormData {
    const body = new FormData();
    body.append('audio', new Blob([new Uint8Array(bytes)], { type: mime }), 'recording');
    return body;
  }

  function post(body: FormData): Promise<Response> {
    return fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        origin: config.WEB_ORIGIN,
        cookie: `session=multipart-security-${++requestNumber}`,
        'x-recording-notice-confirmed': 'true',
        'x-recording-notice-version': RECORDING_NOTICE_VERSION,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
  }

  it.each([
    ['maximum array length followed by append', ['items[4294967294]', 'items[]']],
    ['sparse array converted to an object', ['items[4294967294]', 'items[key]']],
    ['unknown base with out-of-policy index', ['items[50]']],
    ['index just beyond the participant limit', [`participantNames[${MAX_PARTICIPANT_NAMES}]`]],
    ['index with leading zeroes', ['participantNames[00050]']],
    ['nested field representation', ['items[0][1]']],
  ])('rejects %s before storage or billing and releases capacity', async (_label, fieldNames) => {
    const body = audioForm();
    for (const name of fieldNames) body.append(name, 'value');
    const response = await post(body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UPLOAD_ERROR' } });
    expect(assertCanStartMeeting).not.toHaveBeenCalled();
    expect(meetingCreate).not.toHaveBeenCalled();
    expect(uploadAudio).not.toHaveBeenCalled();
    expect(insertIfNew).not.toHaveBeenCalled();

    const control = audioForm();
    control.append('participantNames', '[" Ada ","Grace"]');
    expect((await post(control)).status).toBe(201);
    expect(meetingCreate).toHaveBeenCalledWith(expect.objectContaining({ participantNames: ['Ada', 'Grace'] }));
  });

  it.each(['indexed', 'empty-bracket'] as const)('preserves all 50 %s participants with audio first and last', async (form) => {
    const names = Array.from({ length: MAX_PARTICIPANT_NAMES }, (_, i) => `Person ${i}`);
    for (const fileFirst of [true, false]) {
      vi.clearAllMocks();
      const body = fileFirst ? audioForm() : new FormData();
      names.forEach((name, i) => body.append(form === 'indexed' ? `participantNames[${i}]` : 'participantNames[]', name));
      if (!fileFirst) body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording');
      expect((await post(body)).status).toBe(201);
      expect(meetingCreate).toHaveBeenCalledWith(expect.objectContaining({ participantNames: names }));
      expect(setUploadInfo).toHaveBeenCalledWith(meeting.id, { audioStoragePath: 'recordings/security-test.webm' });
      expect(insertIfNew).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'audio_uploaded' }));
    }
  });

  it('rejects a 51st empty-bracket text field before storage or billing', async () => {
    const body = audioForm();
    for (let i = 0; i <= MAX_PARTICIPANT_NAMES; i++) body.append('participantNames[]', `Person ${i}`);
    const response = await post(body);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UPLOAD_ERROR' } });
    expect(assertCanStartMeeting).not.toHaveBeenCalled();
    expect(uploadAudio).not.toHaveBeenCalled();
    expect(meetingCreate).not.toHaveBeenCalled();
  });

  it('rejects indexed-plus-appended participants beyond the schema limit', async () => {
    const body = audioForm();
    body.append('participantNames[49]', 'Ada');
    body.append('participantNames[]', 'Grace');
    const response = await post(body);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(uploadAudio).not.toHaveBeenCalled();
    expect(assertCanStartMeeting).not.toHaveBeenCalled();
  });

  it('preserves MP4 recordings and trimmed participants', async () => {
    const mp4 = new Uint8Array(16);
    mp4.set([0x66, 0x74, 0x79, 0x70], 4);
    const body = audioForm(mp4, 'audio/mp4');
    body.append('participantNames[]', ' Ada ');
    body.append('participantNames[]', 'Grace');
    expect((await post(body)).status).toBe(201);
    expect(meetingCreate).toHaveBeenCalledWith(expect.objectContaining({ participantNames: ['Ada', 'Grace'] }));
    expect(uploadAudio).toHaveBeenCalledWith(meeting.id, expect.any(Buffer), 'audio/mp4', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('continues to reject oversized audio with FILE_TOO_LARGE', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 1);
    bytes.set(WEBM_BYTES);
    const response = await post(audioForm(bytes));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
    expect(assertCanStartMeeting).not.toHaveBeenCalled();
    expect(uploadAudio).not.toHaveBeenCalled();
  });
});
