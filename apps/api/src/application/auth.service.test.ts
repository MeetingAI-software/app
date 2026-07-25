import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { AuthService } from './auth.service';
import { EmailVerificationTokenService } from './email-verification-token.service';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import {
  EmailAlreadyVerifiedError,
  EmailTakenError,
  ExpiredVerificationTokenError,
  InvalidCredentialsError,
  InvalidVerificationTokenError,
  UsedVerificationTokenError,
  WeakPasswordError,
} from '../domain/errors';
import type { EmailVerificationToken, User, Session, Meeting } from '../domain/types';
import type {
  UserRepository,
  SessionRepository,
  MeetingRepository,
  TranscriptRepository,
  DocumentRepository,
  ChatMessageRepository,
  UsageRepository,
  VerificationTokenRepository,
} from '../ports/repositories.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type {
  EmailVerificationMailer,
  VerificationEmailMessage,
} from '../ports/email-verification-mailer.port';

const TTL_DAYS = 30;
const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

// ---- Stateful fakes for the two repos AuthService fully owns ----
class FakeUserRepo implements UserRepository {
  private seq = 0;
  private byId = new Map<string, User & { passwordHash: string | null; googleId?: string | null }>();
  private byEmail = new Map<string, string>();
  private byGoogleId = new Map<string, string>();
  async create(input: { email: string; passwordHash?: string | null; googleId?: string | null; emailVerified?: boolean }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (this.byEmail.has(email)) throw new EmailTakenError('taken');
    const rec = { id: `u${++this.seq}`, email, emailVerified: input.emailVerified ?? false, passwordHash: input.passwordHash ?? null, googleId: input.googleId ?? null, createdAt: new Date() };
    this.byId.set(rec.id, rec);
    this.byEmail.set(email, rec.id);
    if (input.googleId) this.byGoogleId.set(input.googleId, rec.id);
    return { id: rec.id, email: rec.email, emailVerified: rec.emailVerified, createdAt: rec.createdAt };
  }
  async findByEmailWithHash(email: string) {
    const id = this.byEmail.get(email.trim().toLowerCase());
    const r = id ? this.byId.get(id) : undefined;
    return r ? { id: r.id, email: r.email, emailVerified: r.emailVerified, createdAt: r.createdAt, passwordHash: r.passwordHash, googleId: r.googleId } : null;
  }
  async findByGoogleId(googleId: string) {
    const id = this.byGoogleId.get(googleId);
    const r = id ? this.byId.get(id) : undefined;
    return r ? { id: r.id, email: r.email, emailVerified: r.emailVerified, createdAt: r.createdAt } : null;
  }
  async linkGoogleId(id: string, googleId: string) {
    const r = this.byId.get(id);
    if (r) {
      r.googleId = googleId;
      r.emailVerified = true;
      this.byGoogleId.set(googleId, id);
    }
  }
  async markEmailVerified(id: string) {
    const r = this.byId.get(id);
    if (r) r.emailVerified = true;
  }
  async findById(id: string) {
    const r = this.byId.get(id);
    return r ? { id: r.id, email: r.email, emailVerified: r.emailVerified, createdAt: r.createdAt } : null;
  }
  async updatePassword(id: string, passwordHash: string) {
    const r = this.byId.get(id);
    if (r) r.passwordHash = passwordHash;
  }
  async updateEmail(id: string, email: string): Promise<User> {
    const normalized = email.trim().toLowerCase();
    const owner = this.byEmail.get(normalized);
    if (owner && owner !== id) throw new EmailTakenError('taken');
    const r = this.byId.get(id);
    if (!r) throw new Error('no such user');
    this.byEmail.delete(r.email);
    r.email = normalized;
    r.emailVerified = false;
    this.byEmail.set(normalized, id);
    return { id: r.id, email: r.email, emailVerified: r.emailVerified, createdAt: r.createdAt };
  }
  async deleteById(id: string) {
    const r = this.byId.get(id);
    if (r) { this.byEmail.delete(r.email); this.byId.delete(id); }
  }
  size() { return this.byId.size; }
}

class FakeSessionRepo implements SessionRepository {
  private seq = 0;
  byHash = new Map<string, Session>();
  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<Session> {
    const s = { id: `s${++this.seq}`, userId: input.userId, expiresAt: input.expiresAt, createdAt: new Date() };
    this.byHash.set(input.tokenHash, s);
    return s;
  }
  async findByTokenHash(h: string) { return this.byHash.get(h) ?? null; }
  async deleteByTokenHash(h: string) { this.byHash.delete(h); }
  async deleteAllForUser(userId: string) {
    for (const [h, s] of this.byHash) if (s.userId === userId) this.byHash.delete(h);
  }
  async deleteExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [h, s] of this.byHash) if (s.expiresAt.getTime() < now) { this.byHash.delete(h); removed++; }
    return removed;
  }
}

class FakeVerificationTokenRepo implements VerificationTokenRepository {
  private seq = 0;
  private byHash = new Map<string, EmailVerificationToken>();

  constructor(private readonly users: FakeUserRepo) {}

  async replaceForUser(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    for (const [hash, token] of this.byHash) {
      if (token.userId === input.userId) this.byHash.delete(hash);
    }
    this.byHash.set(input.tokenHash, {
      id: `v${++this.seq}`,
      userId: input.userId,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.byHash.get(tokenHash) ?? null;
  }

  async deleteByTokenHash(tokenHash: string) {
    this.byHash.delete(tokenHash);
  }

  async consumeAndVerify(input: { tokenHash: string; now: Date }) {
    const token = this.byHash.get(input.tokenHash);
    if (!token) return { status: 'invalid' as const };
    if (token.consumedAt) return { status: 'used' as const };
    if (token.expiresAt.getTime() <= input.now.getTime()) return { status: 'expired' as const };

    token.consumedAt = input.now;
    const user = await this.users.findById(token.userId);
    if (!user) throw new Error('missing user');
    if (user.emailVerified) return { status: 'already_verified' as const };

    await this.users.markEmailVerified(user.id);
    const verified = await this.users.findById(user.id);
    if (!verified) throw new Error('missing user');
    return { status: 'verified' as const, user: verified };
  }

  expire(rawToken: string): void {
    const token = this.byHash.get(sha256(rawToken));
    if (token) token.expiresAt = new Date(Date.now() - 1);
  }

  countForUser(userId: string): number {
    return [...this.byHash.values()].filter((token) => token.userId === userId).length;
  }
}

class FakeVerificationMailer implements EmailVerificationMailer {
  readonly sent: VerificationEmailMessage[] = [];
  failure: Error | null = null;

  async sendVerificationEmail(message: VerificationEmailMessage) {
    if (this.failure) throw this.failure;
    this.sent.push(message);
  }
}

// Meeting repo backed by an inspectable store; the rest of its surface is unused here.
function meetingRepoOver(store: Meeting[]): MeetingRepository {
  return {
    create: vi.fn(), findById: vi.fn(), findByBotId: vi.fn(),
    findByShareToken: vi.fn(), findByTranscriptionJobId: vi.fn(),
    updateStatus: vi.fn(), setSummary: vi.fn(), setUploadInfo: vi.fn(),
    countActive: vi.fn(), countActiveForUser: vi.fn(), list: vi.fn(), findByIdForUser: vi.fn(),
    listForUser: vi.fn(async (uid: string) => store.filter((m) => m.ownerUserId === uid)),
    deleteById: vi.fn(async (id: string) => {
      const i = store.findIndex((m) => m.id === id);
      if (i >= 0) store.splice(i, 1);
    }),
  };
}

function makeMeeting(over: Partial<Meeting>): Meeting {
  return {
    id: 'm1', meetingUrl: null, platform: 'zoom', status: 'transcribed', source: 'bot',
    botId: null, ownerUserId: null, durationSeconds: 60, errorMessage: null, summary: null,
    shareToken: 'tok', participantNames: null, audioStoragePath: null, transcriptionJobId: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

function build(meetingStore: Meeting[] = []) {
  const users = new FakeUserRepo();
  const sessions = new FakeSessionRepo();
  const hasher = new Argon2Hasher();
  const meetings = meetingRepoOver(meetingStore);
  const transcripts: TranscriptRepository = { save: vi.fn(), getByMeetingId: vi.fn(), deleteByMeeting: vi.fn() };
  const documents: DocumentRepository = { upsertForMeeting: vi.fn(), getByMeetingId: vi.fn(), deleteByMeeting: vi.fn() };
  const chat: ChatMessageRepository = { add: vi.fn(), listByMeeting: vi.fn(), countUserMessages: vi.fn(), deleteByMeeting: vi.fn() };
  const usage: UsageRepository = { addSeconds: vi.fn(), monthlyTotalSeconds: vi.fn(), deleteByMeeting: vi.fn() };
  const storage: AudioStoragePort = { upload: vi.fn(), getSignedUrl: vi.fn(), delete: vi.fn() };
  const bot: MeetingBotPort = { createBot: vi.fn(), getBotStatus: vi.fn(), fetchTranscript: vi.fn(), deleteRecording: vi.fn() };
  const verificationTokenRepo = new FakeVerificationTokenRepo(users);
  const verificationTokens = new EmailVerificationTokenService(verificationTokenRepo);
  const verificationMailer = new FakeVerificationMailer();
  const verificationDelivery = new EmailVerificationDeliveryService(
    verificationTokens,
    verificationMailer,
    'https://app.example.test',
  );
  const service = new AuthService(
    users, sessions, hasher, TTL_DAYS, meetings, transcripts, documents, chat, usage, storage, bot,
    verificationTokens, verificationDelivery,
  );
  return {
    service, users, sessions, meetings, transcripts, documents, chat, usage, storage, bot,
    verificationTokenRepo, verificationMailer,
  };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  describe('signup', () => {
    it('creates a user (email lowercased), issues a session, and auto-logs-in', async () => {
      const res = await ctx.service.signup('Alice@Example.com', 'a-good-password');
      expect(res.user.email).toBe('alice@example.com');
      expect(res.sessionToken).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
      expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
      // auto-login: the returned token resolves back to the user
      const me = await ctx.service.getUserForToken(res.sessionToken);
      expect(me?.id).toBe(res.user.id);
      expect(ctx.verificationTokenRepo.countForUser(res.user.id)).toBe(1);
      expect(ctx.verificationMailer.sent).toHaveLength(1);
      expect(ctx.verificationMailer.sent[0].to).toBe('alice@example.com');
      const rawToken = new URL(ctx.verificationMailer.sent[0].verificationUrl).searchParams.get('token');
      expect(rawToken).toBeTruthy();
      await expect(ctx.verificationTokenRepo.findByTokenHash(sha256(rawToken as string)))
        .resolves.toMatchObject({ userId: res.user.id });
    });

    it('keeps the new account usable when initial email delivery fails', async () => {
      ctx.verificationMailer.failure = new Error('mailer unavailable');

      const result = await ctx.service.signup('delivery-failure@example.com', 'a-good-password');

      await expect(ctx.service.getUserForToken(result.sessionToken)).resolves.toMatchObject({
        email: 'delivery-failure@example.com',
      });
      expect(ctx.verificationTokenRepo.countForUser(result.user.id)).toBe(1);
    });

    it('rejects a password shorter than 10 chars and creates nothing', async () => {
      await expect(ctx.service.signup('bob@example.com', 'short')).rejects.toBeInstanceOf(WeakPasswordError);
      expect(ctx.users.size()).toBe(0);
    });

    it('rejects a duplicate email with EmailTakenError', async () => {
      await ctx.service.signup('dup@example.com', 'a-good-password');
      await expect(ctx.service.signup('DUP@example.com', 'another-good-one')).rejects.toBeInstanceOf(EmailTakenError);
    });
  });

  describe('resendVerification', () => {
    it('issues and delivers a replacement link for an unverified user', async () => {
      const { user } = await ctx.service.signup('resend@example.com', 'a-good-password');
      const firstUrl = ctx.verificationMailer.sent[0].verificationUrl;

      await ctx.service.resendVerification(user.email);

      expect(ctx.verificationMailer.sent).toHaveLength(2);
      expect(ctx.verificationMailer.sent[1].verificationUrl).not.toBe(firstUrl);
      expect(ctx.verificationTokenRepo.countForUser(user.id)).toBe(1);
    });

    it('does not deliver a message for an unknown email', async () => {
      await ctx.service.resendVerification('missing@example.com');

      expect(ctx.verificationMailer.sent).toHaveLength(0);
    });
  });

  describe('verifyEmail', () => {
    it('atomically consumes the token and marks the user as verified', async () => {
      const { user } = await ctx.service.signup('verify@example.com', 'a-good-password');
      const token = new URL(ctx.verificationMailer.sent[0].verificationUrl).searchParams.get('token') as string;

      const verified = await ctx.service.verifyEmail(token);

      expect(verified).toMatchObject({ id: user.id, emailVerified: true });
      await expect(ctx.users.findById(user.id)).resolves.toMatchObject({ emailVerified: true });
    });

    it('rejects an already consumed token', async () => {
      await ctx.service.signup('used@example.com', 'a-good-password');
      const token = new URL(ctx.verificationMailer.sent[0].verificationUrl).searchParams.get('token') as string;
      await ctx.service.verifyEmail(token);

      await expect(ctx.service.verifyEmail(token)).rejects.toBeInstanceOf(UsedVerificationTokenError);
    });

    it('rejects an unknown token', async () => {
      await expect(ctx.service.verifyEmail('unknown-token'))
        .rejects.toBeInstanceOf(InvalidVerificationTokenError);
    });

    it('rejects an expired token', async () => {
      await ctx.service.signup('expired@example.com', 'a-good-password');
      const token = new URL(ctx.verificationMailer.sent[0].verificationUrl).searchParams.get('token') as string;
      ctx.verificationTokenRepo.expire(token);

      await expect(ctx.service.verifyEmail(token))
        .rejects.toBeInstanceOf(ExpiredVerificationTokenError);
    });

    it('rejects a valid token when the email is already verified', async () => {
      const { user } = await ctx.service.signup('already@example.com', 'a-good-password');
      const token = new URL(ctx.verificationMailer.sent[0].verificationUrl).searchParams.get('token') as string;
      await ctx.users.markEmailVerified(user.id);

      await expect(ctx.service.verifyEmail(token)).rejects.toBeInstanceOf(EmailAlreadyVerifiedError);
    });
  });

  describe('login', () => {
    it('logs in with the right password', async () => {
      await ctx.service.signup('carol@example.com', 'a-good-password');
      const res = await ctx.service.login('carol@example.com', 'a-good-password');
      const me = await ctx.service.getUserForToken(res.sessionToken);
      expect(me?.email).toBe('carol@example.com');
      expect(res.user.emailVerified).toBe(false);
    });

    it('gives an identical InvalidCredentialsError for unknown email and wrong password', async () => {
      await ctx.service.signup('dave@example.com', 'a-good-password');
      await expect(ctx.service.login('nobody@example.com', 'whatever-pass')).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(ctx.service.login('dave@example.com', 'wrong-password')).rejects.toBeInstanceOf(InvalidCredentialsError);
    });
  });

  describe('Google OAuth', () => {
    it('creates new Google users with a verified email', async () => {
      const result = await ctx.service.loginOrCreateGoogleUser('google@example.com', 'google-1');

      expect(result.user.emailVerified).toBe(true);
      await expect(ctx.users.findById(result.user.id)).resolves.toMatchObject({ emailVerified: true });
    });

    it('marks an existing password account verified when linking Google', async () => {
      const { user } = await ctx.service.signup('linked@example.com', 'a-good-password');

      const result = await ctx.service.loginOrCreateGoogleUser(user.email, 'google-2');

      expect(result.user).toMatchObject({ id: user.id, emailVerified: true });
      await expect(ctx.users.findById(user.id)).resolves.toMatchObject({ emailVerified: true });
    });

    it('repairs verification status for a legacy Google account', async () => {
      const legacy = await ctx.users.create({
        email: 'legacy-google@example.com',
        googleId: 'google-legacy',
        emailVerified: false,
      });

      const result = await ctx.service.loginOrCreateGoogleUser(legacy.email, 'google-legacy');

      expect(result.user.emailVerified).toBe(true);
      await expect(ctx.users.findById(legacy.id)).resolves.toMatchObject({ emailVerified: true });
    });
  });

  describe('sessions', () => {
    it('getUserForToken returns null for an unknown token', async () => {
      expect(await ctx.service.getUserForToken('not-a-real-token')).toBeNull();
    });

    it('treats an expired session as null and deletes it lazily', async () => {
      const { service, users, sessions } = ctx;
      const { user } = await service.signup('erin@example.com', 'a-good-password');
      const token = 'expired-token-value';
      await sessions.create({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() - 1000) });
      expect(await service.getUserForToken(token)).toBeNull();
      expect(sessions.byHash.has(sha256(token))).toBe(false); // lazily cleaned up
    });

    it('logout invalidates the session', async () => {
      const res = await ctx.service.signup('frank@example.com', 'a-good-password');
      await ctx.service.logout(res.sessionToken);
      expect(await ctx.service.getUserForToken(res.sessionToken)).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('changes the password, rotates sessions, and keeps the caller signed in on a fresh token', async () => {
      const { user, sessionToken: oldToken } = await ctx.service.signup('ivan@example.com', 'a-good-password');
      const res = await ctx.service.changePassword(user.id, 'a-good-password', 'a-brand-new-password');

      // old session is gone; the returned token is live
      expect(await ctx.service.getUserForToken(oldToken)).toBeNull();
      expect(await ctx.service.getUserForToken(res.sessionToken)).not.toBeNull();
      // the new password logs in, the old one does not
      await expect(ctx.service.login('ivan@example.com', 'a-brand-new-password')).resolves.toBeTruthy();
      await expect(ctx.service.login('ivan@example.com', 'a-good-password')).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('rejects a wrong current password', async () => {
      const { user } = await ctx.service.signup('judy@example.com', 'a-good-password');
      await expect(ctx.service.changePassword(user.id, 'wrong-one', 'a-brand-new-password')).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('rejects a weak new password', async () => {
      const { user } = await ctx.service.signup('kate@example.com', 'a-good-password');
      await expect(ctx.service.changePassword(user.id, 'a-good-password', 'short')).rejects.toBeInstanceOf(WeakPasswordError);
    });
  });

  describe('changeEmail', () => {
    it('changes the email after verifying the password', async () => {
      const { user } = await ctx.service.signup('leo@example.com', 'a-good-password');
      const token = new URL(ctx.verificationMailer.sent[0].verificationUrl).searchParams.get('token') as string;
      await ctx.service.verifyEmail(token);
      const updated = await ctx.service.changeEmail(user.id, 'a-good-password', 'Leo-New@Example.com');
      expect(updated.email).toBe('leo-new@example.com');
      expect(updated.emailVerified).toBe(false);
      expect(ctx.verificationMailer.sent.at(-1)?.to).toBe('leo-new@example.com');
      await expect(ctx.service.login('leo-new@example.com', 'a-good-password')).resolves.toBeTruthy();
    });

    it('rejects a wrong password', async () => {
      const { user } = await ctx.service.signup('mona@example.com', 'a-good-password');
      await expect(ctx.service.changeEmail(user.id, 'nope', 'mona2@example.com')).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('rejects an email already in use', async () => {
      await ctx.service.signup('taken@example.com', 'a-good-password');
      const { user } = await ctx.service.signup('nate@example.com', 'a-good-password');
      await expect(ctx.service.changeEmail(user.id, 'a-good-password', 'TAKEN@example.com')).rejects.toBeInstanceOf(EmailTakenError);
    });
  });

  describe('deleteAccount', () => {
    it('rejects a wrong password and keeps the account', async () => {
      const { user } = await ctx.service.signup('grace@example.com', 'a-good-password');
      await expect(ctx.service.deleteAccount(user.id, 'wrong-password')).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(ctx.users.size()).toBe(1);
    });

    it('erases the user, their sessions, meetings, children, and provider media', async () => {
      const store: Meeting[] = [];
      const c = build(store);
      const { user, sessionToken } = await c.service.signup('heidi@example.com', 'a-good-password');
      store.push(makeMeeting({ id: 'm-owned', ownerUserId: user.id, source: 'bot', botId: 'bot-9', audioStoragePath: 'audio/heidi.webm' }));

      await c.service.deleteAccount(user.id, 'a-good-password');

      // provider-side media purged
      expect(c.storage.delete).toHaveBeenCalledWith('audio/heidi.webm');
      expect(c.bot.deleteRecording).toHaveBeenCalledWith('bot-9');
      // every DB child of the meeting purged, then the meeting, then the user
      expect(c.chat.deleteByMeeting).toHaveBeenCalledWith('m-owned');
      expect(c.documents.deleteByMeeting).toHaveBeenCalledWith('m-owned');
      expect(c.transcripts.deleteByMeeting).toHaveBeenCalledWith('m-owned');
      expect(c.usage.deleteByMeeting).toHaveBeenCalledWith('m-owned');
      expect(store).toHaveLength(0);
      expect(c.users.size()).toBe(0);
      expect(await c.service.getUserForToken(sessionToken)).toBeNull();
    });
  });
});
