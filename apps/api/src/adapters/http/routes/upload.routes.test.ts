import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import { FeatureUnavailableError } from '../../../domain/errors';
import type { MeetingRepository, WebhookEventRepository } from '../../../ports/repositories.port';
import type { AudioStoragePort } from '../../../ports/audio-storage.port';
import type { UsageMeterService } from '../../../application/usage-meter.service';
import { createServer } from '../server';
import { createUploadRoutes } from './upload.routes';

/** Passes the content sniffer: an EBML header, which is what a real WebM recording opens with. */
const WEBM_BYTES = (() => {
  const bytes = new Uint8Array(16);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
})();

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

  it('returns FEATURE_UNAVAILABLE before creating a meeting', async () => {
    const body = new FormData();
    body.append('audio', new Blob([WEBM_BYTES], { type: 'audio/webm' }), 'recording.webm');
    body.append('participantNames', '[]');

    const response = await fetch(`${baseUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: { origin: config.WEB_ORIGIN, cookie: 'session=valid-token' },
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
      headers: { origin: config.WEB_ORIGIN, cookie: 'session=valid-token' },
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
