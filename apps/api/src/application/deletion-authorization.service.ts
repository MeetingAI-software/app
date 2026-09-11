import { createHash, randomBytes } from 'node:crypto';
import type { SessionRepository, UserRepository } from '../ports/repositories.port';
import type { DeletionAuthorizationRepository, GoogleDeletionIdentity } from '../ports/deletion-authorization.port';
import { DeletionReauthenticationRequiredError } from '../domain/errors';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export const DELETION_STATE_PREFIX = 'delete.';

export class DeletionAuthorizationService {
  constructor(
    private readonly repository: DeletionAuthorizationRepository,
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly google: GoogleDeletionIdentity,
  ) {}

  private async identity(sessionToken: string, userId?: string) {
    const session = await this.sessions.findByTokenHash(hash(sessionToken));
    if (!session || session.expiresAt.getTime() <= Date.now() || (userId && session.userId !== userId)) {
      throw new DeletionReauthenticationRequiredError();
    }
    const user = await this.users.findById(session.userId);
    const record = user ? await this.users.findByEmailWithHash(user.email) : null;
    if (!record?.googleId || record.passwordHash) throw new DeletionReauthenticationRequiredError();
    return { session, googleSub: record.googleId };
  }

  async start(userId: string, sessionToken: string): Promise<string> {
    const { session, googleSub } = await this.identity(sessionToken, userId);
    const state = DELETION_STATE_PREFIX + secret();
    const nonce = secret();
    // Validate provider configuration before replacing an existing challenge.
    const url = this.google.authorizationUrl(state, nonce);
    const now = new Date();
    await this.repository.replace({ userId, sessionId: session.id, googleSub,
      stateHash: hash(state), nonceHash: hash(nonce), createdAt: now,
      expiresAt: new Date(Math.min(now.getTime() + 10 * 60_000, session.expiresAt.getTime())),
    });
    return url;
  }

  async complete(sessionToken: string, state: string, code: string): Promise<{ token: string; expiresAt: Date }> {
    const { session, googleSub } = await this.identity(sessionToken);
    if (!state.startsWith(DELETION_STATE_PREFIX) || !code) throw new DeletionReauthenticationRequiredError();
    // Consume the challenge before contacting Google; errors/replays require a new POST.
    const challenge = await this.repository.claim({ stateHash: hash(state), sessionId: session.id,
      userId: session.userId, now: new Date() });
    if (!challenge || challenge.googleSub !== googleSub) throw new DeletionReauthenticationRequiredError();
    let claims;
    try { claims = await this.google.verifyCode(code); }
    catch { throw new DeletionReauthenticationRequiredError(); }
    const now = new Date();
    const seconds = Math.floor(now.getTime() / 1000);
    if (claims.sub !== googleSub || claims.aud !== this.google.audience
      || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '')
      || typeof claims.nonce !== 'string' || hash(claims.nonce) !== challenge.nonceHash
      || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)
      || claims.iat! < Math.floor(challenge.createdAt.getTime() / 1000) - 30
      || claims.iat! > seconds + 30 || claims.exp! <= seconds
      || challenge.expiresAt.getTime() <= now.getTime()) throw new DeletionReauthenticationRequiredError();
    // A new signed assertion bound to our nonce proves the new OAuth round. It does not prove
    // a freshly entered Google password (Google does not support forced account reauthentication).
    await this.identity(sessionToken, session.userId);
    const token = secret();
    const expiresAt = new Date(Math.min(now.getTime() + 5 * 60_000, session.expiresAt.getTime()));
    if (!await this.repository.issueGrant({ stateHash: challenge.stateHash, grantHash: hash(token), expiresAt, now })) {
      throw new DeletionReauthenticationRequiredError();
    }
    return { token, expiresAt };
  }

  async consume(userId: string, sessionToken: string, grantToken: string): Promise<void> {
    const { session, googleSub } = await this.identity(sessionToken, userId);
    if (!grantToken || !await this.repository.consumeGrant({ grantHash: hash(grantToken), sessionId: session.id,
      userId, googleSub, now: new Date() })) throw new DeletionReauthenticationRequiredError();
  }
}
