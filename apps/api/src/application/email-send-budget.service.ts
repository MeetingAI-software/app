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
  /**
   * Fail-open is loud, but only once. During a flood every request hits the same fault, and an
   * unlatched report would bury Sentry in the middle of the incident it exists for.
   */
  private ledgerFaultReported = false;

  constructor(
    private readonly ledger: EmailSendLedgerRepository,
    private readonly dailyBudget: number,
    dependencies: BudgetDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async reserve(trigger: EmailSendTrigger, userId: string | null): Promise<void> {
    const spent = await this.countSpent();

    // A failed read is the only path that skips the cap. Never fail open on a *successful* read —
    // that line is what makes this a control rather than advice.
    if (spent === null) return;
    if (spent >= this.dailyBudget) {
      logger.warn(
        { trigger, spent, budget: this.dailyBudget },
        'Verification email suppressed: daily send budget exhausted',
      );
      throw new EmailSendBudgetExhaustedError();
    }

    try {
      await this.ledger.record({ userId, trigger });
    } catch (err) {
      // The count above was authoritative and said there was room. Refusing the send now because
      // the bookkeeping failed is pure downside — it costs a legitimate email and protects nothing.
      this.reportLedgerFault(err, 'Email send ledger write failed; send allowed unrecorded');
    }
  }

  async hasRemaining(): Promise<boolean> {
    const spent = await this.countSpent();
    return spent === null || spent < this.dailyBudget;
  }

  /** Sends inside the rolling window, or null when the ledger is unreadable (→ fail open). */
  private async countSpent(): Promise<number | null> {
    const since = new Date(this.now().getTime() - EMAIL_SEND_BUDGET_WINDOW_MS);
    try {
      return await this.ledger.countSince(since);
    } catch (err) {
      // Migrations are a manual step here (railway.json only builds and starts), so "deployed
      // before migrated" is the default outcome of forgetting one command — and the table is
      // simply absent. Failing closed on that would create accounts that are never emailed AND
      // 500 the resend that would rescue them: a silent, unrecoverable outage. Failing open
      // degrades to exactly the behaviour that shipped before this budget existed.
      this.reportLedgerFault(err, 'Email send ledger unreadable; budget not enforced');
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
