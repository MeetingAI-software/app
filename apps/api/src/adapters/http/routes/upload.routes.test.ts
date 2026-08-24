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
    body.append('audio', new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' }), 'recording.webm');

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
    body.append('audio', new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' }), 'recording.webm');
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
      body.append('audio', new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' }), 'recording.webm');
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
