import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import { db } from '../../db/client';
import { createServer } from '../server';
import { createHealthRoutes } from './health.routes';

vi.mock('../../db/client', () => ({ db: { execute: vi.fn() } }));

describe('GET /healthz', () => {
  let server: Server;
  let baseUrl: string;
  let previousCommit: string;

  beforeAll(() => {
    const app = createServer([createHealthRoutes()], async () => null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    previousCommit = config.GIT_COMMIT;
    vi.mocked(db.execute).mockReset();
  });

  afterEach(() => {
    config.GIT_COMMIT = previousCommit;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('reports ok and the deployed commit when the database answers', async () => {
    vi.mocked(db.execute).mockResolvedValue(undefined as never);
    config.GIT_COMMIT = 'deadbeefcafe';

    const res = await fetch(`${baseUrl}/healthz`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: 'deadbeefcafe' });
  });

  // The deploy pipeline polls this field for the merged SHA. If it ever silently stopped being
  // echoed, every deploy would still look healthy while the verification step compared '' to a SHA
  // forever — so the contract is worth pinning, not just the status code.
  it('falls back to "unknown" outside the deploy pipeline', async () => {
    vi.mocked(db.execute).mockResolvedValue(undefined as never);

    const res = await fetch(`${baseUrl}/healthz`);

    expect(await res.json()).toMatchObject({ commit: 'unknown' });
  });

  it('reports 500 when the database is unreachable', async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error('connection refused'));

    const res = await fetch(`${baseUrl}/healthz`);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'Database connection failed' });
  });
});
