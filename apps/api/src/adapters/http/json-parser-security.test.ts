import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DestinationStream } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as sentry from '../observability/sentry';
import { config } from '../../config/env';
import { createServer } from './server';

describe('public JSON parser boundary', () => {
  let server: Server;
  let baseUrl: string;
  const logs: string[] = [];
  const stream: DestinationStream = { write: chunk => { logs.push(chunk); } };

  beforeAll(() => {
    const router = express.Router();
    router.post('/api/auth/login', (_req, res) => res.status(200).json({ ok: true }));
    const app = createServer([router], async () => null, { requestLogStream: stream });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  function post(body: string, clientIp: string) {
    return fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: {
      origin: config.WEB_ORIGIN, 'content-type': 'application/json',
      'x-forwarded-for': `${clientIp}, 10.0.0.1`,
    }, body });
  }

  it('returns 400 for malformed JSON without Sentry or raw-body error logs', async () => {
    const capture = vi.spyOn(sentry, 'captureError');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await post('{"password":"synthetic-secret",', '203.0.113.70');
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'INVALID_JSON', message: 'Invalid JSON body' },
      });
      expect(capture).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      expect(logs.join('')).not.toContain('synthetic-secret');
    } finally { capture.mockRestore(); errorLog.mockRestore(); }
  });

  it('returns 413 for oversized JSON without reporting a server failure', async () => {
    const capture = vi.spyOn(sentry, 'captureError');
    try {
      const response = await post(JSON.stringify({ padding: 'x'.repeat(110_000) }), '203.0.113.71');
      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'BODY_TOO_LARGE' } });
      expect(capture).not.toHaveBeenCalled();
    } finally { capture.mockRestore(); }
  });

  it('bounds repeated invalid payloads before they reach JSON parsing', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await post('{', '203.0.113.72')).status);
    }
    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(400));
    expect(statuses[60]).toBe(429);
    const otherClient = await post('{"ok":true}', '203.0.113.73');
    expect(otherClient.status).toBe(200);
  });
});
