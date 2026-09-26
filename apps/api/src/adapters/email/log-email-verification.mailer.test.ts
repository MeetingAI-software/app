import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { LogEmailVerificationMailer } from './log-email-verification.mailer';

describe('LogEmailVerificationMailer', () => {
  it('never writes a bearer link, token or address to logs', async () => {
    const info = vi.fn();
    const mailer = new LogEmailVerificationMailer({ info } as unknown as Pick<Logger, 'info'>);
    const expiresAt = new Date('2026-07-26T12:00:00.000Z');

    await mailer.sendVerificationEmail({
      to: 'person@example.com',
      verificationUrl: 'https://app.example.com/verify-email?token=secret-token',
      expiresAt,
    });

    expect(info).toHaveBeenCalledOnce();
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(info.mock.calls)).not.toContain('person@example.com');
  });
});
