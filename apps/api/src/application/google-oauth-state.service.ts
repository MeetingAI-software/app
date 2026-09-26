import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleOAuthChallenge, GoogleOAuthPurpose, GoogleOAuthStateRepository } from '../ports/google-oauth-state.port';
import { OAuthCapacityError } from '../domain/errors';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const TTL_MS = 10 * 60_000;

export class GoogleOAuthStateService {
  constructor(private readonly repository: GoogleOAuthStateRepository) {}

  async issue(input: { purpose: GoogleOAuthPurpose; userId?: string;
    sessionToken?: string; authVersion?: number }): Promise<{ state: string; nonce: string }> {
    if (input.purpose === 'link' && (!input.userId || !input.sessionToken
      || input.authVersion === undefined)) throw new Error('Google link requires an authenticated session');
    const state = `${input.purpose}.${random()}`;
    const nonce = random();
    const createdAt = new Date();
    const admitted = await this.repository.issue({
      stateHash: hash(state), nonceHash: hash(nonce), purpose: input.purpose,
      userId: input.userId ?? null,
      sessionHash: input.sessionToken ? hash(input.sessionToken) : null,
      authVersion: input.authVersion ?? null,
      createdAt, expiresAt: new Date(createdAt.getTime() + TTL_MS),
    });
    if (!admitted) throw new OAuthCapacityError();
    return { state, nonce };
  }

  async claim(state: string, sessionToken: string | null): Promise<GoogleOAuthChallenge | null> {
    if (!/^(login|link)\.[A-Za-z0-9_-]{43}$/.test(state)) return null;
    const challenge = await this.repository.claim(hash(state), new Date());
    if (!challenge || !state.startsWith(`${challenge.purpose}.`)) return null;
    if (challenge.purpose === 'link') {
      if (!sessionToken || !challenge.sessionHash || !challenge.userId
        || challenge.authVersion === null) return null;
      const presented = Buffer.from(hash(sessionToken), 'hex');
      const stored = Buffer.from(challenge.sessionHash, 'hex');
      if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null;
    }
    return challenge;
  }

  matchesNonce(challenge: GoogleOAuthChallenge, nonce: unknown): boolean {
    if (typeof nonce !== 'string') return false;
    const presented = Buffer.from(hash(nonce), 'hex');
    const stored = Buffer.from(challenge.nonceHash, 'hex');
    return presented.length === stored.length && timingSafeEqual(presented, stored);
  }
}
