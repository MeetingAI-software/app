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
    return this.claim(input, [
      ['global', 1200],
      [`ip:${digest(input.ip)}`, 40],
      [`account:${digest(input.email.trim().toLowerCase())}`, 12],
    ]);
  }

  async admitSignup(input: { ip: string; email: string; now: Date }): Promise<boolean> {
    // Signup is an unauthenticated Argon2 hash. These separate shared counters prevent many
    // source addresses from saturating every API replica even when each IP stays below its
    // process-local route limit. Keep the account key to bound repeated work for one address.
    return this.claim(input, [
      ['signup:global', 60],
      [`signup:ip:${digest(input.ip)}`, 5],
      [`signup:account:${digest(input.email.trim().toLowerCase())}`, 3],
    ]);
  }

  private async claim(input: { ip: string; email: string; now: Date },
    limits: readonly (readonly [string, number])[]): Promise<boolean> {
    const window = Math.floor(input.now.getTime() / WINDOW_MS);
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
          if (scope === 'global' || scope === 'signup:global') firstInWindow = admitted.count === 1;
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
