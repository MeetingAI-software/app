import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { LogEmailVerificationMailer } from './log-email-verification.mailer';

describe('LogEmailVerificationMailer', () => {
  it('writes a complete simulated verification email to structured logs', async () => {
    const info = vi.fn();
    const mailer = new LogEmailVerificationMailer({ info } as unknown as Pick<Logger, 'info'>);
    const expiresAt = new Date('2026-07-26T12:00:00.000Z');

    await mailer.sendVerificationEmail({
      to: 'person@example.com',
      verificationUrl: 'https://app.example.com/verify-email?token=secret-token',
      expiresAt,
    });

    expect(info).toHaveBeenCalledWith(
      {
        to: 'person@example.com',
        verificationUrl: 'https://app.example.com/verify-email?token=secret-token',
        expiresAt: expiresAt.toISOString(),
      },
      'Email verification message simulated',
    );
  });
});
