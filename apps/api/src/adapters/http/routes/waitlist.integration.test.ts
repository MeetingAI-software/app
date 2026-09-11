import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import { db, migrateOnce, truncateAll } from '../../db/pglite-harness';
import { waitlistSignups } from '../../db/schema';
import { createServer } from '../server';
import { createWaitlistRoutes } from './waitlist.routes';
import { DrizzleWaitlistRepository } from '../../db/repositories/waitlist.repository';

vi.mock('../../db/client', () => ({ db }));

/**
 * The route and the repository each have their own tests with the other side faked. This one runs
 * the request through the real server stack — CORS, origin check, the public-endpoint list, the
 * body parser — into real SQL built by the committed migrations. It is the test that fails if the
 * endpoint is ever quietly moved behind authentication, or the table drifts from the schema.
 */
describe('the waitlist, end to end', () => {
  let server: Server;
  let baseUrl: string;

  function join(body: unknown) {
    return fetch(`${baseUrl}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: config.WEB_ORIGIN },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    await migrateOnce();
    const app = createServer([createWaitlistRoutes(new DrizzleWaitlistRepository())], async () => null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('lands a signed-out visitor in the database', async () => {
    const res = await join({ email: 'Person@Example.com', source: 'upgrade' });

    expect(res.status).toBe(201);
    const rows = await db.select().from(waitlistSignups);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('person@example.com');
    expect(rows[0].source).toBe('upgrade');
  });

  it('takes a second submission of the same address without failing or duplicating', async () => {
    await join({ email: 'person@example.com' });
    const res = await join({ email: 'person@example.com' });

    expect(res.status).toBe(201);
    expect(await db.select().from(waitlistSignups)).toHaveLength(1);
  });

  it('stores nothing when the address is malformed', async () => {
    const res = await join({ email: 'nope' });

    expect(res.status).toBe(400);
    expect(await db.select().from(waitlistSignups)).toHaveLength(0);
  });
});
