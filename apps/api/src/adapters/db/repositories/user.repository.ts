import { db } from '../client';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import type { UserRepository } from '../../../ports/repositories.port';
import type { User } from '../../../domain/types';
import { EmailTakenError } from '../../../domain/errors';

// Postgres unique-constraint violation — Day 5: the users.email UNIQUE index trips this.
const PG_UNIQUE_VIOLATION = '23505';

/** Emails are stored and looked up lowercased so "A@x.com" and "a@x.com" are one account. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUser(row: { id: string; email: string; createdAt: Date }): User {
  return { id: row.id, email: row.email, createdAt: row.createdAt };
}

export class DrizzleUserRepository implements UserRepository {
  async create(input: { email: string; passwordHash: string }): Promise<User> {
    const email = normalizeEmail(input.email);
    try {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: input.passwordHash })
        .returning();
      return toUser(row);
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new EmailTakenError(`Email already registered: ${email}`);
      }
      throw err;
    }
  }

  /** Includes passwordHash — for AuthService only; never hand this to a route response. */
  async findByEmailWithHash(email: string): Promise<(User & { passwordHash: string }) | null> {
    const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
    return row ? { ...toUser(row), passwordHash: row.passwordHash } : null;
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ? toUser(row) : null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }

  /** Lowercased on write; the users.email UNIQUE index trips PG 23505 → EmailTakenError. */
  async updateEmail(id: string, email: string): Promise<User> {
    const normalized = normalizeEmail(email);
    try {
      const [row] = await db.update(users).set({ email: normalized }).where(eq(users.id, id)).returning();
      return toUser(row);
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new EmailTakenError(`Email already registered: ${normalized}`);
      }
      throw err;
    }
  }

  async deleteById(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
}
