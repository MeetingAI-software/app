import { describe, expect, it, vi } from 'vitest';
import type { EmailVerificationMailer } from '../ports/email-verification-mailer.port';
import { EmailSendBudgetExhaustedError } from '../domain/errors';
import type { EmailSendBudget } from './email-send-budget.service';
import type { EmailVerificationTokenIssuer } from './email-verification-token.service';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';

/** A budget with room, unless `exhausted` is set — the default for tests that aren't about it. */
function budgetWith(exhausted = false): EmailSendBudget {
  return {
    reserve: vi.fn(async () => {
      if (exhausted) throw new EmailSendBudgetExhaustedError();
    }),
    hasRemaining: vi.fn().mockResolvedValue(!exhausted),
  };
}

describe('EmailVerificationDeliveryService', () => {
  it('issues a token and sends a verification link to the user', async () => {
    const expiresAt = new Date('2026-07-26T12:00:00.000Z');
    const tokens: EmailVerificationTokenIssuer = {
      issueForUser: vi.fn().mockResolvedValue({ token: 'raw/token+value', expiresAt }),
    };
    const mailer: EmailVerificationMailer = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    const budget = budgetWith();
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com/base', budget);

    await service.sendTo({ id: 'user-1', email: 'person@example.com' }, 'signup');

    expect(budget.reserve).toHaveBeenCalledWith('signup', 'user-1');
    expect(tokens.issueForUser).toHaveBeenCalledWith('user-1');
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'person@example.com',
      verificationUrl: 'https://app.example.com/verify-email?token=raw%2Ftoken%2Bvalue',
      expiresAt,
    });
  });

  it('does not call the mailer when token issuance fails', async () => {
    const tokens: EmailVerificationTokenIssuer = {
      issueForUser: vi.fn().mockRejectedValue(new Error('token store unavailable')),
    };
    const mailer: EmailVerificationMailer = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com', budgetWith());

    await expect(service.sendTo({ id: 'user-1', email: 'person@example.com' }, 'signup'))
      .rejects.toThrow('token store unavailable');
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('keeps delivery failures observable to the caller', async () => {
    const tokens: EmailVerificationTokenIssuer = {
      issueForUser: vi.fn().mockResolvedValue({ token: 'token', expiresAt: new Date() }),
    };
    const mailer: EmailVerificationMailer = {
      sendVerificationEmail: vi.fn().mockRejectedValue(new Error('mailer unavailable')),
    };
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com', budgetWith());

    await expect(service.sendTo({ id: 'user-1', email: 'person@example.com' }, 'signup'))
      .rejects.toThrow('mailer unavailable');
  });

  // Issuing replaces the user's live token, so a budget-blocked send must stop short of it —
  // otherwise refusing to mail a new link would also destroy the one already in their inbox.
  it('does not issue a replacement token when the budget is exhausted', async () => {
    const tokens: EmailVerificationTokenIssuer = {
      issueForUser: vi.fn().mockResolvedValue({ token: 'token', expiresAt: new Date() }),
    };
    const mailer: EmailVerificationMailer = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com', budgetWith(true));

    await expect(service.sendTo({ id: 'user-1', email: 'person@example.com' }, 'resend'))
      .rejects.toThrow(EmailSendBudgetExhaustedError);
    expect(tokens.issueForUser).not.toHaveBeenCalled();
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
