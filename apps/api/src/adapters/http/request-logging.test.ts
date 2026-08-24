import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { DestinationStream } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, sanitizeRequestUrl } from './server';

describe('safe request logging', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    server = undefined;
  });

  it('keeps the path but removes every query name and value', () => {
    expect(sanitizeRequestUrl('/callback?query-key-secret=query-value-secret&state=browser-state'))
      .toBe('/callback?[Redacted]');
    expect(sanitizeRequestUrl('/healthz')).toBe('/healthz');
  });

  it('never writes cookies, secret headers, query values or Set-Cookie values', async () => {
    const lines: string[] = [];
    const stream: DestinationStream = {
      write(chunk: string) {
        lines.push(chunk);
      },
    };
    const router = express.Router();
    router.post('/webhooks/log-probe', (req, res) => {
      req.log.info({ marker: 'child-log' }, 'child record');
      res.setHeader('set-cookie', 'session=response-cookie-secret; HttpOnly');
      res.status(204).end();
    });

    const app = createServer([router], async () => null, { requestLogStream: stream });
    server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${baseUrl}/webhooks/log-probe?token=query-secret&code=oauth-secret`, {
      method: 'POST',
      headers: {
        cookie: 'session=request-cookie-secret',
        'content-type': 'application/json',
        'x-transcription-secret': 'transcription-secret',
        'webhook-signature': 'webhook-signature-secret',
        'paddle-signature': 'paddle-signature-secret',
      },
      body: '{}',
    });
    expect(response.status).toBe(204);
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(2));

    const log = lines.join('');
    for (const secret of [
      'request-cookie-secret',
      'response-cookie-secret',
      'transcription-secret',
      'webhook-signature-secret',
      'paddle-signature-secret',
      'query-secret',
      'oauth-secret',
    ]) {
      expect(log).not.toContain(secret);
    }
    expect(log).toContain('/webhooks/log-probe?[Redacted]');
  });
});
