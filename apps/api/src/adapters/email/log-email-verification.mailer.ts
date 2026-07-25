import type { Logger } from 'pino';
import { logger } from '../../config/logger';
import type {
  EmailVerificationMailer,
  VerificationEmailMessage,
} from '../../ports/email-verification-mailer.port';

/** Development delivery adapter: simulates an email by writing its link to structured logs. */
export class LogEmailVerificationMailer implements EmailVerificationMailer {
  constructor(private readonly log: Pick<Logger, 'info'> = logger) {}

  async sendVerificationEmail(message: VerificationEmailMessage): Promise<void> {
    this.log.info(
      {
        to: message.to,
        verificationUrl: message.verificationUrl,
        expiresAt: message.expiresAt.toISOString(),
      },
      'Email verification message simulated',
    );
  }
}
