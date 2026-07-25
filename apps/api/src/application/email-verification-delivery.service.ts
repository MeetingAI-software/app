import type { User } from '../domain/types';
import type { EmailVerificationMailer } from '../ports/email-verification-mailer.port';
import type { EmailVerificationTokenIssuer } from './email-verification-token.service';

export interface EmailVerificationDelivery {
  sendTo(user: Pick<User, 'id' | 'email'>): Promise<void>;
}

/** Issues a fresh token, builds the public verification link, and hands it to the mail adapter. */
export class EmailVerificationDeliveryService implements EmailVerificationDelivery {
  constructor(
    private readonly tokens: EmailVerificationTokenIssuer,
    private readonly mailer: EmailVerificationMailer,
    private readonly webOrigin: string,
  ) {}

  async sendTo(user: Pick<User, 'id' | 'email'>): Promise<void> {
    const issued = await this.tokens.issueForUser(user.id);
    const verificationUrl = new URL('/verify-email', this.webOrigin);
    verificationUrl.searchParams.set('token', issued.token);

    await this.mailer.sendVerificationEmail({
      to: user.email,
      verificationUrl: verificationUrl.toString(),
      expiresAt: issued.expiresAt,
    });
  }
}
