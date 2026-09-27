import { db } from '../client';
import { emailVerificationTokens, users } from '../schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { UserRepository } from '../../../ports/repositories.port';
import type { User } from '../../../domain/types';
import { EmailTakenError, InvalidCredentialsError } from '../../../domain/errors';

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
  async create(input: Parameters<UserRepository['create']>[0]): ReturnType<UserRepository['create']> {
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
      return { ...toUser(row), authVersion: row.authVersion };
    } catch (err) {
      if (hasPostgresErrorCode(err, PG_UNIQUE_VIOLATION)) {
        throw new EmailTakenError(`Email already registered: ${email}`);
      }
      throw err;
    }
  }

  /** Includes passwordHash — for AuthService only; never hand this to a route response. */
  async findByEmailWithHash(email: string): ReturnType<UserRepository['findByEmailWithHash']> {
    const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
    return row ? {
      ...toUser(row), passwordHash: row.passwordHash, googleId: row.googleId,
      authVersion: row.authVersion,
    } : null;
  }

  async findByGoogleId(googleId: string): ReturnType<UserRepository['findByGoogleId']> {
    const [row] = await db.select().from(users).where(eq(users.googleId, googleId));
    return row ? { ...toUser(row), authVersion: row.authVersion } : null;
  }

  async linkGoogleId(input: Parameters<UserRepository['linkGoogleId']>[0]): Promise<boolean> {
    try {
      const attached = await db.update(users).set({ googleId: input.googleId })
        .where(and(
          eq(users.id, input.userId), eq(users.email, normalizeEmail(input.email)),
          eq(users.emailVerified, true), eq(users.authVersion, input.expectedAuthVersion),
          isNull(users.googleId),
        )).returning({ id: users.id });
      return attached.length === 1;
    } catch (error) {
      // The unique google_id constraint chooses a single winner for concurrent links to a sub.
      if (hasPostgresErrorCode(error, PG_UNIQUE_VIOLATION)) return false;
      throw error;
    }
  }

  async markEmailVerified(id: string): Promise<void> {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, id));
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ? toUser(row) : null;
  }

  async beginDeletion(id: string): Promise<void> {
    // reserve() locks the same owner row before inserting a meeting. Whichever transaction wins
    // commits first; a later reservation sees this durable marker and cannot start provider work.
    const [row] = await db.update(users).set({
      deletionStartedAt: sql`coalesce(${users.deletionStartedAt}, now())`,
    }).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) throw new InvalidCredentialsError('Account no longer exists');
  }

  async updatePassword(id: string, passwordHash: string, expectedAuthVersion: number): Promise<number> {
    const [row] = await db.update(users).set({
      passwordHash,
      authVersion: sql`${users.authVersion} + 1`,
    }).where(and(eq(users.id, id), eq(users.authVersion, expectedAuthVersion)))
      .returning({ authVersion: users.authVersion });
    if (!row) throw new InvalidCredentialsError('Credentials changed; sign in again');
    return row.authVersion;
  }

  /** Lowercased on write; the users.email UNIQUE index trips PG 23505 → EmailTakenError. */
  async updateEmail(id: string, email: string, expectedAuthVersion: number): Promise<User> {
    const normalized = normalizeEmail(email);
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set({
            email: normalized,
            emailVerified: false,
            googleId: null,
            emailVersion: sql`${users.emailVersion} + 1`,
          })
          .where(and(eq(users.id, id), eq(users.authVersion, expectedAuthVersion)))
          .returning();
        if (!row) throw new InvalidCredentialsError('Credentials changed; sign in again');
        // If issuance acquired the user lock first, this deletes its token. If this update acquired
        // it first, issuance later reads the new address/version. A->B->A cannot revive old links.
        await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
        return toUser(row);
      });
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
