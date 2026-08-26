import { db } from '../client';
import { waitlistSignups } from '../schema';
import { sql } from 'drizzle-orm';
import type { WaitlistRepository, WaitlistSource } from '../../../ports/repositories.port';

export class DrizzleWaitlistRepository implements WaitlistRepository {
  /**
   * `onConflictDoNothing` rather than a read-then-write: two visitors submitting the same address
   * at once would both see an empty table and one would hit the unique constraint as a 500. The
   * empty `returning` is what tells us the row was already there.
   */
  async add(input: { email: string; source: WaitlistSource }): Promise<boolean> {
    const inserted = await db
      .insert(waitlistSignups)
      .values({ email: input.email.trim().toLowerCase(), source: input.source })
      .onConflictDoNothing({ target: waitlistSignups.email })
      .returning({ id: waitlistSignups.id });

    return inserted.length > 0;
  }

  async count(): Promise<number> {
    const [row] = await db.select({ total: sql<string>`count(*)` }).from(waitlistSignups);
    return parseInt(row?.total || '0', 10);
  }
}
