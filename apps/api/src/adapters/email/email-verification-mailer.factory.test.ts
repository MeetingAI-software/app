import { describe, expect, it } from 'vitest';
import { createEmailVerificationMailer } from './email-verification-mailer.factory';
import { LogEmailVerificationMailer } from './log-email-verification.mailer';
import { ResendEmailVerificationMailer } from './resend-email-verification.mailer';

describe('createEmailVerificationMailer', () => {
  it('keeps log delivery as an explicit local option', () => {
    expect(createEmailVerificationMailer({ provider: 'log' }))
      .toBeInstanceOf(LogEmailVerificationMailer);
  });

  it('creates the real Resend adapter when all credentials are present', () => {
    expect(createEmailVerificationMailer({
      provider: 'resend',
      resendApiKey: 're_test',
      resendFrom: 'MeetingAI <verify@example.com>',
    })).toBeInstanceOf(ResendEmailVerificationMailer);
  });

  it.each([
    [{ provider: 'resend', resendFrom: 'MeetingAI <verify@example.com>' } as const, 'RESEND_API_KEY'],
    [{ provider: 'resend', resendApiKey: 're_test' } as const, 'RESEND_FROM'],
  ])('fails fast when required Resend configuration is missing', (config, expectedVariable) => {
    expect(() => createEmailVerificationMailer(config)).toThrow(expectedVariable);
  });
});
