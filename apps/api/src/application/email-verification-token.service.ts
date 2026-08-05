import crypto from 'crypto';
import type { EmailVerificationToken } from '../domain/types';
import type {
  VerificationTokenConsumeResult,
  VerificationTokenRepository,
} from '../ports/repositories.port';

const TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Minimum gap between two verification emails to the same account. The route limiter in front of
 * /api/auth/resend-verification is in-memory and per-instance, and its bucket includes the caller's
 * IP — so it cannot stop a rotating-IP resend loop from mailbombing an address and draining the
 * daily send quota. This check is keyed on the account in the database, which is the durable one.
 */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export interface IssuedEmailVerificationToken {
  token: string;
  expiresAt: Date;
}

export interface EmailVerificationTokenIssuer {
  issueForUser(userId: string): Promise<IssuedEmailVerificationToken>;
}

interface TokenServiceDependencies {
  now?: () => Date;
  generateToken?: () => string;
}

export function hashEmailVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Owns creation, hashing, expiry, replacement, and lookup of email verification tokens. */
export class EmailVerificationTokenService implements EmailVerificationTokenIssuer {
  private readonly now: () => Date;
  private readonly generateToken: () => string;

  constructor(
    private readonly tokens: VerificationTokenRepository,
    dependencies: TokenServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.generateToken = dependencies.generateToken
      ?? (() => crypto.randomBytes(TOKEN_BYTES).toString('base64url'));
  }

  async issueForUser(userId: string): Promise<IssuedEmailVerificationToken> {
    const token = this.generateToken();
    const expiresAt = new Date(this.now().getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
    await this.tokens.replaceForUser({
      userId,
      tokenHash: hashEmailVerificationToken(token),
      expiresAt,
    });
    return { token, expiresAt };
  }

  findByToken(token: string): Promise<EmailVerificationToken | null> {
    return this.tokens.findByTokenHash(hashEmailVerificationToken(token));
  }

  /** True while the user's live token is younger than the cooldown, i.e. a resend should be skipped. */
  async isWithinResendCooldown(userId: string): Promise<boolean> {
    const existing = await this.tokens.findForUser(userId);
    if (!existing) return false;
    const age = this.now().getTime() - existing.createdAt.getTime();
    return age < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
  }

  deleteByToken(token: string): Promise<void> {
    return this.tokens.deleteByTokenHash(hashEmailVerificationToken(token));
  }

  consumeAndVerify(token: string): Promise<VerificationTokenConsumeResult> {
    return this.tokens.consumeAndVerify({
      tokenHash: hashEmailVerificationToken(token),
      now: this.now(),
    });
  }
}
