import { createHash } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '../client';
import { loginAttemptBudgets as budgets } from '../schema';
import type { LoginAdmissionRepository } from '../../../ports/login-admission.port';

const WINDOW_MS = 15 * 60_000;
const RETENTION_WINDOWS = 96;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
class LimitReached extends Error {}

export class DrizzleLoginAdmissionRepository implements LoginAdmissionRepository {
  async admit(input: { ip: string; email: string; now: Date }): Promise<boolean> {
    const window = Math.floor(input.now.getTime() / WINDOW_MS);
    const limits = [
      ['global', 1200],
      [`ip:${digest(input.ip)}`, 40],
      [`account:${digest(input.email.trim().toLowerCase())}`, 12],
    ] as const;
    try {
      await db.transaction(async tx => {
        let firstInWindow = false;
        for (const [scope, max] of limits) {
          const [admitted] = await tx.insert(budgets).values({ scope, window, count: 1 })
            .onConflictDoUpdate({
              target: [budgets.scope, budgets.window],
              set: { count: sql`${budgets.count} + 1` },
              setWhere: lt(budgets.count, max),
            }).returning({ count: budgets.count });
          if (!admitted) throw new LimitReached();
          if (scope === 'global') firstInWindow = admitted.count === 1;
        }
        if (firstInWindow) await tx.delete(budgets).where(lt(budgets.window, window - RETENTION_WINDOWS));
      });
      return true;
    } catch (error) {
      if (error instanceof LimitReached) return false;
      throw error;
    }
  }
}
