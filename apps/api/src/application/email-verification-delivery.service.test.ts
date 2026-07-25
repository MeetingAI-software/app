import { describe, expect, it, vi } from 'vitest';
import type { EmailVerificationMailer } from '../ports/email-verification-mailer.port';
import type { EmailVerificationTokenIssuer } from './email-verification-token.service';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';

describe('EmailVerificationDeliveryService', () => {
  it('issues a token and sends a verification link to the user', async () => {
    const expiresAt = new Date('2026-07-26T12:00:00.000Z');
    const tokens: EmailVerificationTokenIssuer = {
      issueForUser: vi.fn().mockResolvedValue({ token: 'raw/token+value', expiresAt }),
    };
    const mailer: EmailVerificationMailer = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com/base');

    await service.sendTo({ id: 'user-1', email: 'person@example.com' });

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
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com');

    await expect(service.sendTo({ id: 'user-1', email: 'person@example.com' }))
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
    const service = new EmailVerificationDeliveryService(tokens, mailer, 'https://app.example.com');

    await expect(service.sendTo({ id: 'user-1', email: 'person@example.com' }))
      .rejects.toThrow('mailer unavailable');
  });
});
