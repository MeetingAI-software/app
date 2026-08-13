import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { users } from '../schema';
import { DrizzleUserRepository } from './user.repository';
import { EmailTakenError } from '../../../domain/errors';

vi.mock('../client', () => ({ db }));

describe('DrizzleUserRepository', () => {
  let repo: DrizzleUserRepository;

  async function rawById(id: string) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleUserRepository();
  });

  describe('create', () => {
    it('stores a password user with the documented defaults', async () => {
      const user = await repo.create({ email: 'person@example.com', passwordHash: 'argon2-hash' });

      expect(user.email).toBe('person@example.com');
      expect(user.emailVerified).toBe(false);   // password signups start unverified
      expect(user.createdAt).toBeInstanceOf(Date);
      expect((await rawById(user.id)).passwordHash).toBe('argon2-hash');
    });

    it('stores an OAuth user with no password hash and a pre-verified address', async () => {
      const user = await repo.create({ email: 'oauth@example.com', googleId: 'sub-1', emailVerified: true });

      expect(user.emailVerified).toBe(true);
      const raw = await rawById(user.id);
      expect(raw.passwordHash).toBeNull();
      expect(raw.googleId).toBe('sub-1');
    });

    // "A@X.com " and "a@x.com" must be one account, or a user could register twice and lock
    // themselves out of the first one.
    it('lowercases and trims the email on write', async () => {
      const user = await repo.create({ email: '  MiXeD@Example.COM  ', passwordHash: 'h' });
      expect(user.email).toBe('mixed@example.com');
    });

    // This is the mapping that turns a raw Postgres 23505 into a domain error the signup route can
    // answer with. It cannot be verified against a fake database — only a real one emits that code.
    it('raises EmailTakenError rather than a raw driver error on a duplicate', async () => {
      await repo.create({ email: 'dupe@example.com', passwordHash: 'h' });

      await expect(repo.create({ email: 'dupe@example.com', passwordHash: 'h' }))
        .rejects.toThrow(EmailTakenError);
    });

    it('treats a differently-cased duplicate as taken', async () => {
      await repo.create({ email: 'case@example.com', passwordHash: 'h' });

      await expect(repo.create({ email: 'CASE@Example.com', passwordHash: 'h' }))
        .rejects.toThrow(EmailTakenError);
    });
  });

  describe('lookups', () => {
    it('findByEmailWithHash returns the hash and is case-insensitive', async () => {
      const created = await repo.create({ email: 'person@example.com', passwordHash: 'secret-hash' });

      const found = await repo.findByEmailWithHash('PERSON@Example.com');

      expect(found?.id).toBe(created.id);
      expect(found?.passwordHash).toBe('secret-hash');
    });

    it('findByEmailWithHash returns null for an unknown address', async () => {
      expect(await repo.findByEmailWithHash('nobody@example.com')).toBeNull();
    });

    // findById feeds route responses. If the hash rode along, every /api/auth/me would ship an
    // argon2 hash to the browser.
    it('findById never exposes the password hash', async () => {
      const created = await repo.create({ email: 'person@example.com', passwordHash: 'secret-hash' });

      const found = await repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(Object.keys(found as object).sort()).toEqual(['createdAt', 'email', 'emailVerified', 'id']);
      expect('passwordHash' in (found as object)).toBe(false);
    });

    it('findById returns null for an unknown id', async () => {
      expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });

    it('findByGoogleId finds the linked account and nothing else', async () => {
      const created = await repo.create({ email: 'oauth@example.com', googleId: 'sub-9', emailVerified: true });
      await repo.create({ email: 'plain@example.com', passwordHash: 'h' });

      expect((await repo.findByGoogleId('sub-9'))?.id).toBe(created.id);
      expect(await repo.findByGoogleId('sub-none')).toBeNull();
    });
  });

  describe('mutations', () => {
    it('markEmailVerified flips the flag on the target only', async () => {
      const a = await repo.create({ email: 'a@example.com', passwordHash: 'h' });
      const b = await repo.create({ email: 'b@example.com', passwordHash: 'h' });

      await repo.markEmailVerified(a.id);

      expect((await repo.findById(a.id))?.emailVerified).toBe(true);
      expect((await repo.findById(b.id))?.emailVerified).toBe(false);
    });

    // Linking Google proves control of the mailbox, so it verifies the address as a side effect.
    it('linkGoogleId stores the id and verifies the address', async () => {
      const user = await repo.create({ email: 'link@example.com', passwordHash: 'h' });

      await repo.linkGoogleId(user.id, 'sub-linked');

      const raw = await rawById(user.id);
      expect(raw.googleId).toBe('sub-linked');
      expect(raw.emailVerified).toBe(true);
    });

    it('updatePassword changes only the target’s hash', async () => {
      const a = await repo.create({ email: 'a@example.com', passwordHash: 'old-a' });
      const b = await repo.create({ email: 'b@example.com', passwordHash: 'old-b' });

      await repo.updatePassword(a.id, 'new-a');

      expect((await rawById(a.id)).passwordHash).toBe('new-a');
      expect((await rawById(b.id)).passwordHash).toBe('old-b');
    });

    // Changing address must drop verified status — otherwise typing a stranger's address would hand
    // you a verified account you never proved you own.
    it('updateEmail normalizes the address and resets verification', async () => {
      const user = await repo.create({ email: 'before@example.com', passwordHash: 'h', emailVerified: true });

      const updated = await repo.updateEmail(user.id, '  AFTER@Example.COM ');

      expect(updated.email).toBe('after@example.com');
      expect(updated.emailVerified).toBe(false);
    });

    it('updateEmail raises EmailTakenError when the address belongs to someone else', async () => {
      await repo.create({ email: 'taken@example.com', passwordHash: 'h' });
      const mover = await repo.create({ email: 'mover@example.com', passwordHash: 'h' });

      await expect(repo.updateEmail(mover.id, 'taken@example.com'))
        .rejects.toThrow(EmailTakenError);
      // The failed change must not have altered the row.
      expect((await repo.findById(mover.id))?.email).toBe('mover@example.com');
    });

    it('deleteById removes only the target', async () => {
      const a = await repo.create({ email: 'a@example.com', passwordHash: 'h' });
      const b = await repo.create({ email: 'b@example.com', passwordHash: 'h' });

      await repo.deleteById(a.id);

      expect(await repo.findById(a.id)).toBeNull();
      expect(await repo.findById(b.id)).not.toBeNull();
    });
  });
});
