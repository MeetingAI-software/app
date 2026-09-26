import { logger } from '../config/logger';
import { captureError } from '../adapters/observability/sentry';
import { EmailSendBudgetExhaustedError } from '../domain/errors';
import type { EmailSendLedgerRepository, EmailSendTrigger } from '../ports/repositories.port';

/**
 * Rolling, not calendar. `date_trunc('day')` would allow 2N sends across a midnight boundary — N
 * at 23:59 and N at 00:01 — and we do not control when Resend's own day resets, so a rolling
 * window is the only one whose bound holds unconditionally.
 */
export const EMAIL_SEND_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface EmailSendBudget {
  /** Claims one send, or throws EmailSendBudgetExhaustedError. Call BEFORE spending the email. */
  reserve(trigger: EmailSendTrigger, userId: string | null): Promise<void>;
  /** Non-consuming probe, for callers that must decide before doing any other work. */
  hasRemaining(): Promise<boolean>;
}

interface BudgetDependencies {
  now?: () => Date;
}

/**
 * The global backstop on verification email volume (§2). The route limiters are in-memory and
 * IP-keyed: a deploy wipes them and a rotating-IP flood walks straight past them. This one is
 * durable and global, which is what makes draining the provider quota arithmetically impossible.
 */
export class EmailSendBudgetService implements EmailSendBudget {
  private readonly now: () => Date;
  /** A persistent fault during a flood should produce one monitoring event per process. */
  private ledgerFaultReported = false;

  constructor(
    private readonly ledger: EmailSendLedgerRepository,
    private readonly dailyBudget: number,
    dependencies: BudgetDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async reserve(trigger: EmailSendTrigger, userId: string | null): Promise<void> {
    const now = this.now();
    let admitted: boolean;
    try {
      admitted = await this.ledger.tryReserve({
        userId, trigger, now,
        since: new Date(now.getTime() - EMAIL_SEND_BUDGET_WINDOW_MS),
        limit: this.dailyBudget,
      });
    } catch (err) {
      this.reportLedgerFault(err, 'Email send ledger unavailable; send blocked');
      throw new EmailSendBudgetExhaustedError();
    }
    if (!admitted) {
      logger.warn({ trigger, budget: this.dailyBudget }, 'Verification email suppressed: daily send budget exhausted');
      throw new EmailSendBudgetExhaustedError();
    }
  }

  async hasRemaining(): Promise<boolean> {
    const spent = await this.countSpent();
    return spent !== null && spent < this.dailyBudget;
  }

  /** Non-consuming probe only; the transactional reservation is authoritative. */
  private async countSpent(): Promise<number | null> {
    const since = new Date(this.now().getTime() - EMAIL_SEND_BUDGET_WINDOW_MS);
    try {
      return await this.ledger.countSince(since);
    } catch (err) {
      this.reportLedgerFault(err, 'Email send ledger unreadable; send blocked');
      return null;
    }
  }

  private reportLedgerFault(err: unknown, msg: string): void {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, msg);
    if (this.ledgerFaultReported) return;
    this.ledgerFaultReported = true;
    captureError(err, { component: 'email-send-budget' });
  }
}
