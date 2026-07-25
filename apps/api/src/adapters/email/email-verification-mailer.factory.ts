import type { EmailVerificationMailer } from '../../ports/email-verification-mailer.port';
import { LogEmailVerificationMailer } from './log-email-verification.mailer';
import { ResendEmailVerificationMailer } from './resend-email-verification.mailer';

export interface EmailVerificationMailerConfig {
  provider: 'log' | 'resend';
  resendApiKey?: string;
  resendFrom?: string;
}

export function createEmailVerificationMailer(
  config: EmailVerificationMailerConfig,
): EmailVerificationMailer {
  if (config.provider === 'log') return new LogEmailVerificationMailer();
  if (!config.resendApiKey) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER is "resend"');
  }
  if (!config.resendFrom) {
    throw new Error('RESEND_FROM is required when EMAIL_PROVIDER is "resend"');
  }
  return new ResendEmailVerificationMailer(config.resendApiKey, config.resendFrom);
}
