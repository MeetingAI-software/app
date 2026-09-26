import type { Logger } from 'pino';
import { logger } from '../../config/logger';
import type {
  EmailVerificationMailer,
  VerificationEmailMessage,
} from '../../ports/email-verification-mailer.port';

/** Development-only sink. Never copy a bearer verification link into application logs. */
export class LogEmailVerificationMailer implements EmailVerificationMailer {
  constructor(private readonly log: Pick<Logger, 'info'> = logger) {}

  async sendVerificationEmail(_message: VerificationEmailMessage): Promise<void> {
    this.log.info(
      'Verification email suppressed by development log provider; configure Resend for delivery',
    );
  }
}
