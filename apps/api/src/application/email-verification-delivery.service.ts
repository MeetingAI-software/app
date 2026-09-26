import type { User } from '../domain/types';
import type { EmailVerificationMailer } from '../ports/email-verification-mailer.port';
import type { EmailSendTrigger } from '../ports/repositories.port';
import type { EmailSendBudget } from './email-send-budget.service';
import type { EmailVerificationTokenIssuer } from './email-verification-token.service';

export interface EmailVerificationDelivery {
  sendTo(user: Pick<User, 'id' | 'email'>, trigger: EmailSendTrigger): Promise<void>;
}

/**
 * Issues a fresh token, builds the public verification link, and hands it to the mail adapter.
 * The single chokepoint every send path passes through, which is why the global budget is claimed
 * here rather than at the three call sites.
 */
export class EmailVerificationDeliveryService implements EmailVerificationDelivery {
  constructor(
    private readonly tokens: EmailVerificationTokenIssuer,
    private readonly mailer: EmailVerificationMailer,
    private readonly webOrigin: string,
    private readonly budget: EmailSendBudget,
  ) {}

  async sendTo(user: Pick<User, 'id' | 'email'>, trigger: EmailSendTrigger): Promise<void> {
    const issued = await this.tokens.issueForDelivery(user.id, trigger, this.budget);
    if (!issued) return;
    const verificationUrl = new URL('/verify-email', this.webOrigin);
    verificationUrl.searchParams.set('token', issued.token);

    await this.mailer.sendVerificationEmail({
      to: issued.email,
      verificationUrl: verificationUrl.toString(),
      expiresAt: issued.expiresAt,
    });
  }
}
