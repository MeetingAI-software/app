import { describe, expect, it, vi } from 'vitest';
import * as sentry from '../adapters/observability/sentry';
import type { EmailSendLedgerRepository, EmailSendTrigger } from '../ports/repositories.port';
import { EmailSendBudgetExhaustedError } from '../domain/errors';
import { EMAIL_SEND_BUDGET_WINDOW_MS, EmailSendBudgetService } from './email-send-budget.service';

// ---- Array-backed fake for the one repo this service owns ----
class FakeEmailSendLedgerRepository implements EmailSendLedgerRepository {
  readonly rows: { userId: string | null; trigger: EmailSendTrigger; createdAt: Date }[] = [];
  readFailure: Error | null = null;
  writeFailure: Error | null = null;

  constructor(private readonly now: () => Date) {}

  async countSince(since: Date) {
    if (this.readFailure) throw this.readFailure;
    return this.rows.filter((row) => row.createdAt.getTime() >= since.getTime()).length;
  }

  async record(input: { userId: string | null; trigger: EmailSendTrigger }) {
    if (this.writeFailure) throw this.writeFailure;
    this.rows.push({ ...input, createdAt: this.now() });
  }

  async deleteOlderThan(cutoff: Date) {
    const before = this.rows.length;
    const kept = this.rows.filter((row) => row.createdAt.getTime() >= cutoff.getTime());
    this.rows.splice(0, this.rows.length, ...kept);
    return before - kept.length;
  }
}

const BUDGET = 30;

function build() {
  // Mutable clock: lets a test step across the 24h window without waiting a day.
  const clock = { now: new Date('2026-08-06T12:00:00.000Z') };
  const ledger = new FakeEmailSendLedgerRepository(() => clock.now);
  const service = new EmailSendBudgetService(ledger, BUDGET, { now: () => clock.now });
  return { service, ledger, clock };
}

describe('EmailSendBudgetService', () => {
  it('records the send with its trigger while under the budget', async () => {
    const { service, ledger } = build();

    await service.reserve('signup', 'user-1');

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({ userId: 'user-1', trigger: 'signup' });
  });

  it('refuses the send that would exceed the daily budget (30 allowed, 31st blocked)', async () => {
    const { service, ledger } = build();
    for (let i = 0; i < BUDGET; i++) await service.reserve('signup', `user-${i}`);

    await expect(service.reserve('signup', 'user-30')).rejects.toThrow(EmailSendBudgetExhaustedError);
    // The blocked attempt spends nothing, so it cannot push the count further from the truth.
    expect(ledger.rows).toHaveLength(BUDGET);
  });

  it('counts only sends inside the rolling window', async () => {
    const { service, ledger, clock } = build();
    const spentAt = clock.now.getTime();
    for (let i = 0; i < BUDGET; i++) await service.reserve('signup', `user-${i}`);

    // A send sitting exactly on the window edge still counts, so the budget holds right up to it.
    clock.now = new Date(spentAt + EMAIL_SEND_BUDGET_WINDOW_MS);
    await expect(service.reserve('resend', 'user-late')).rejects.toThrow(EmailSendBudgetExhaustedError);

    // One millisecond past, the whole batch has aged out and the budget is free again.
    clock.now = new Date(spentAt + EMAIL_SEND_BUDGET_WINDOW_MS + 1);
    await service.reserve('resend', 'user-late');
    expect(ledger.rows).toHaveLength(BUDGET + 1);
  });

  // Migrations are a manual step here, so "deployed before migrated" means this table is simply
  // absent. Failing closed on that would break account creation AND the resend that rescues it.
  it('allows the send when the ledger read fails', async () => {
    const { service, ledger } = build();
    ledger.readFailure = new Error('relation "email_send_ledger" does not exist');

    await expect(service.reserve('signup', 'user-1')).resolves.toBeUndefined();
    await expect(service.hasRemaining()).resolves.toBe(true);
  });

  it('allows the send when the ledger write fails', async () => {
    const { service, ledger } = build();
    ledger.writeFailure = new Error('ledger write timed out');

    // The count already said there was room; refusing now would cost a legitimate email and
    // protect nothing.
    await expect(service.reserve('signup', 'user-1')).resolves.toBeUndefined();
  });

  // A successful read that says "over budget" is the one case that must never fail open — that is
  // the line between a control and mere advice.
  it('still refuses once the budget is spent even though other faults fail open', async () => {
    const { service, ledger } = build();
    for (let i = 0; i < BUDGET; i++) await service.reserve('signup', `user-${i}`);
    ledger.writeFailure = new Error('ledger write timed out');

    await expect(service.reserve('signup', 'user-30')).rejects.toThrow(EmailSendBudgetExhaustedError);
  });

  it('reports no remaining budget once it is spent', async () => {
    const { service } = build();
    await expect(service.hasRemaining()).resolves.toBe(true);

    for (let i = 0; i < BUDGET; i++) await service.reserve('signup', `user-${i}`);

    await expect(service.hasRemaining()).resolves.toBe(false);
  });

  it('probes without consuming budget', async () => {
    const { service, ledger } = build();

    await service.hasRemaining();
    await service.hasRemaining();

    expect(ledger.rows).toHaveLength(0);
  });

  it('drops ledger rows older than the retention cutoff', async () => {
    const { service, ledger, clock } = build();
    await service.reserve('signup', 'user-old');
    const cutoff = new Date(clock.now.getTime() + 1);
    clock.now = new Date(clock.now.getTime() + 2);
    await service.reserve('resend', 'user-new');

    await expect(ledger.deleteOlderThan(cutoff)).resolves.toBe(1);
    expect(ledger.rows.map((row) => row.userId)).toEqual(['user-new']);
  });

  it('reports a ledger fault to monitoring only once per process', async () => {
    const { service, ledger } = build();
    const captureError = vi.spyOn(sentry, 'captureError');
    ledger.readFailure = new Error('ledger unreachable');

    try {
      for (let i = 0; i < 5; i++) await service.reserve('signup', `user-${i}`);
      // Fail-open during a flood means every request hits the same fault; an unlatched report
      // would bury Sentry in the middle of the incident it exists for.
      expect(captureError).toHaveBeenCalledTimes(1);
    } finally {
      captureError.mockRestore();
    }
  });
});
