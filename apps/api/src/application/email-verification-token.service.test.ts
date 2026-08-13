import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import type { EmailVerificationToken } from '../domain/types';
import type { VerificationTokenRepository } from '../ports/repositories.port';
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  EmailVerificationTokenService,
} from './email-verification-token.service';

class FakeVerificationTokenRepository implements VerificationTokenRepository {
  private sequence = 0;
  readonly byHash = new Map<string, EmailVerificationToken>();

  async replaceForUser(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    for (const [hash, token] of this.byHash) {
      if (token.userId === input.userId) this.byHash.delete(hash);
    }
    this.byHash.set(input.tokenHash, {
      id: `token-${++this.sequence}`,
      userId: input.userId,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.byHash.get(tokenHash) ?? null;
  }

  async findForUser(userId: string) {
    for (const token of this.byHash.values()) {
      if (token.userId === userId) return token;
    }
    return null;
  }

  async deleteByTokenHash(tokenHash: string) {
    this.byHash.delete(tokenHash);
  }

  async deleteExpired(now: Date): Promise<number> {
    const before = this.byHash.size;
    for (const [tokenHash, token] of this.byHash) {
      if (token.expiresAt.getTime() <= now.getTime()) this.byHash.delete(tokenHash);
    }
    return before - this.byHash.size;
  }

  async consumeAndVerify(input: { tokenHash: string; now: Date }) {
    const token = this.byHash.get(input.tokenHash);
    if (!token) return { status: 'invalid' as const };
    if (token.consumedAt) return { status: 'used' as const };
    if (token.expiresAt.getTime() <= input.now.getTime()) return { status: 'expired' as const };
    token.consumedAt = input.now;
    return {
      status: 'verified' as const,
      user: {
        id: token.userId,
        email: 'person@example.com',
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    };
  }

}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('EmailVerificationTokenService', () => {
  it('issues a 256-bit base64url token and persists only its SHA-256 hash', async () => {
    const repository = new FakeVerificationTokenRepository();
    const service = new EmailVerificationTokenService(repository);

    const issued = await service.issueForUser('user-1');

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repository.byHash.has(issued.token)).toBe(false);
    expect(repository.byHash.has(sha256(issued.token))).toBe(true);
  });

  it('sets the token expiry to exactly 24 hours after issuance', async () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const service = new EmailVerificationTokenService(
      new FakeVerificationTokenRepository(),
      { now: () => now, generateToken: () => 'fixed-token' },
    );

    const issued = await service.issueForUser('user-1');

    expect(issued.expiresAt.getTime()).toBe(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
  });

  it('invalidates the previous token when issuing a replacement', async () => {
    const repository = new FakeVerificationTokenRepository();
    const generated = ['first-token', 'replacement-token'];
    const service = new EmailVerificationTokenService(
      repository,
      { generateToken: () => generated.shift() as string },
    );

    const first = await service.issueForUser('user-1');
    const replacement = await service.issueForUser('user-1');

    await expect(service.findByToken(first.token)).resolves.toBeNull();
    await expect(service.findByToken(replacement.token)).resolves.toMatchObject({ userId: 'user-1' });
    expect(repository.byHash).toHaveLength(1);
  });

  it('hashes raw tokens for lookup and deletion', async () => {
    const repository = new FakeVerificationTokenRepository();
    const service = new EmailVerificationTokenService(
      repository,
      { generateToken: () => 'single-use-token' },
    );
    const issued = await service.issueForUser('user-1');

    await expect(service.findByToken(issued.token)).resolves.toMatchObject({ userId: 'user-1' });
    await service.deleteByToken(issued.token);
    await expect(service.findByToken(issued.token)).resolves.toBeNull();
  });

  it('hashes and consumes a valid token at the injected current time', async () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const repository = new FakeVerificationTokenRepository();
    const service = new EmailVerificationTokenService(
      repository,
      { now: () => now, generateToken: () => 'token-to-consume' },
    );
    const issued = await service.issueForUser('user-1');

    await expect(service.consumeAndVerify(issued.token)).resolves.toMatchObject({
      status: 'verified',
      user: { id: 'user-1', emailVerified: true },
    });
    expect(repository.byHash.get(sha256(issued.token))?.consumedAt).toEqual(now);
  });
});
