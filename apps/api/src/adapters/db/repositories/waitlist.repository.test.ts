import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { waitlistSignups } from '../schema';
import { DrizzleWaitlistRepository } from './waitlist.repository';

vi.mock('../client', () => ({ db }));

describe('DrizzleWaitlistRepository', () => {
  let repo: DrizzleWaitlistRepository;

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleWaitlistRepository();
  });

  it('stores the address, its source and when it arrived', async () => {
    expect(await repo.add({ email: 'person@example.com', source: 'signin' })).toBe(true);

    const [row] = await db.select().from(waitlistSignups);
    expect(row.email).toBe('person@example.com');
    expect(row.source).toBe('signin');
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('keeps the source of the dialog the address came from', async () => {
    await repo.add({ email: 'buyer@example.com', source: 'upgrade' });

    const [row] = await db.select().from(waitlistSignups);
    expect(row.source).toBe('upgrade');
  });

  // The route in front of this is public, so the same person pressing the button twice — or a bot
  // replaying the request — must not grow the list or surface an error.
  it('reports false and adds nothing when the address is already on the list', async () => {
    await repo.add({ email: 'person@example.com', source: 'signin' });

    expect(await repo.add({ email: 'person@example.com', source: 'upgrade' })).toBe(false);
    expect(await db.select().from(waitlistSignups)).toHaveLength(1);
  });

  // Addresses are case-insensitive in practice, and the unique constraint is not. Normalizing on
  // the way in is what makes "already on the list" mean what a person expects it to.
  it('treats a differently cased or padded address as the same person', async () => {
    await repo.add({ email: 'Person@Example.com', source: 'signin' });

    expect(await repo.add({ email: '  PERSON@example.COM  ', source: 'signin' })).toBe(false);

    const rows = await db.select().from(waitlistSignups);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('person@example.com');
  });

  it('keeps separate addresses apart', async () => {
    await repo.add({ email: 'one@example.com', source: 'signin' });
    await repo.add({ email: 'two@example.com', source: 'upgrade' });

    expect(await repo.count()).toBe(2);
  });

  it('counts 0, not NaN, on an empty list', async () => {
    expect(await repo.count()).toBe(0);
  });
});
