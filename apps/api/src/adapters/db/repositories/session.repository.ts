import { db } from '../client';
import { sessions } from '../schema';
import { eq } from 'drizzle-orm';
import type { SessionRepository } from '../../../ports/repositories.port';
import type { Session } from '../../../domain/types';

// Only ever the sha256 of the opaque token reaches this repo; the raw token lives solely in
// the httpOnly cookie (Day 5 §2), so a DB leak yields no usable sessions.
function toSession(row: { id: string; userId: string; expiresAt: Date; createdAt: Date }): Session {
  return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, createdAt: row.createdAt };
}

export class DrizzleSessionRepository implements SessionRepository {
  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<Session> {
    const [row] = await db
      .insert(sessions)
      .values({ userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt })
      .returning();
    return toSession(row);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return row ? toSession(row) : null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
}
