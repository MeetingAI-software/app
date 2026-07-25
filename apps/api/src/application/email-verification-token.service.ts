import crypto from 'crypto';
import type { EmailVerificationToken } from '../domain/types';
import type { VerificationTokenRepository } from '../ports/repositories.port';

const TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssuedEmailVerificationToken {
  token: string;
  expiresAt: Date;
}

interface TokenServiceDependencies {
  now?: () => Date;
  generateToken?: () => string;
}

export function hashEmailVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Owns creation, hashing, expiry, replacement, and lookup of email verification tokens. */
export class EmailVerificationTokenService {
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

  deleteByToken(token: string): Promise<void> {
    return this.tokens.deleteByTokenHash(hashEmailVerificationToken(token));
  }
}
