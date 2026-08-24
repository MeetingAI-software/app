import { db } from '../client';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import type { UserRepository } from '../../../ports/repositories.port';
import type { User } from '../../../domain/types';
import { EmailTakenError } from '../../../domain/errors';

// Postgres unique-constraint violation — Day 5: the users.email UNIQUE index trips this.
const PG_UNIQUE_VIOLATION = '23505';

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  let current = error;
  const visited = new Set<object>();

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === code) return true;
    current = candidate.cause;
  }

  return false;
}

/** Emails are stored and looked up lowercased so "A@x.com" and "a@x.com" are one account. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUser(row: {
  id: string;
  email: string;
  emailVerified: boolean;
  passwordHash?: string | null;
  googleId?: string | null;
  organizationName?: string | null;
  businessUseConfirmedAt?: Date | null;
  termsVersionAccepted?: string | null;
  createdAt: Date;
}): User {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    hasPassword: Boolean(row.passwordHash),
    hasGoogleLogin: Boolean(row.googleId),
    organizationName: row.organizationName ?? null,
    businessUseConfirmedAt: row.businessUseConfirmedAt ?? null,
    termsVersionAccepted: row.termsVersionAccepted ?? null,
    createdAt: row.createdAt,
  };
}

export class DrizzleUserRepository implements UserRepository {
  async create(input: Parameters<UserRepository['create']>[0]): Promise<User> {
    const email = normalizeEmail(input.email);
    try {
      const [row] = await db
        .insert(users)
        .values({
          email,
          passwordHash: input.passwordHash ?? null,
          googleId: input.googleId ?? null,
          emailVerified: input.emailVerified ?? false,
          organizationName: input.organizationName ?? null,
          businessUseConfirmedAt: input.businessUseConfirmedAt ?? null,
          termsVersionAccepted: input.termsVersionAccepted ?? null,
        })
        .returning();
      return toUser(row);
    } catch (err) {
      if (hasPostgresErrorCode(err, PG_UNIQUE_VIOLATION)) {
        throw new EmailTakenError(`Email already registered: ${email}`);
      }
      throw err;
    }
  }

  /** Includes passwordHash — for AuthService only; never hand this to a route response. */
  async findByEmailWithHash(email: string): Promise<(User & { passwordHash: string | null; googleId?: string | null }) | null> {
    const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
    return row ? { ...toUser(row), passwordHash: row.passwordHash, googleId: row.googleId } : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.googleId, googleId));
    return row ? toUser(row) : null;
  }

  async linkGoogleId(id: string, googleId: string): Promise<void> {
    await db.update(users).set({ googleId, emailVerified: true }).where(eq(users.id, id));
  }

  async markEmailVerified(id: string): Promise<void> {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, id));
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
      const [row] = await db
        .update(users)
        .set({ email: normalized, emailVerified: false })
        .where(eq(users.id, id))
        .returning();
      return toUser(row);
    } catch (err) {
      if (hasPostgresErrorCode(err, PG_UNIQUE_VIOLATION)) {
        throw new EmailTakenError(`Email already registered: ${normalized}`);
      }
      throw err;
    }
  }

  async deleteById(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
}
