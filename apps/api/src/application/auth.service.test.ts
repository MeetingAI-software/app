import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { AuthService } from './auth.service';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import { InvalidCredentialsError, WeakPasswordError, EmailTakenError } from '../domain/errors';
import type { User, Session, Meeting } from '../domain/types';
import type {
  UserRepository,
  SessionRepository,
  MeetingRepository,
  TranscriptRepository,
  DocumentRepository,
  ChatMessageRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';

const TTL_DAYS = 30;
const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

// ---- Stateful fakes for the two repos AuthService fully owns ----
class FakeUserRepo implements UserRepository {
  private seq = 0;
  private byId = new Map<string, User & { passwordHash: string }>();
  private byEmail = new Map<string, string>();
  async create(input: { email: string; passwordHash: string }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (this.byEmail.has(email)) throw new EmailTakenError('taken');
    const rec = { id: `u${++this.seq}`, email, passwordHash: input.passwordHash, createdAt: new Date() };
    this.byId.set(rec.id, rec);
    this.byEmail.set(email, rec.id);
    return { id: rec.id, email: rec.email, createdAt: rec.createdAt };
  }
  async findByEmailWithHash(email: string) {
    const id = this.byEmail.get(email.trim().toLowerCase());
    const r = id ? this.byId.get(id) : undefined;
    return r ? { id: r.id, email: r.email, createdAt: r.createdAt, passwordHash: r.passwordHash } : null;
  }
  async findById(id: string) {
    const r = this.byId.get(id);
    return r ? { id: r.id, email: r.email, createdAt: r.createdAt } : null;
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
  const service = new AuthService(
    users, sessions, hasher, TTL_DAYS, meetings, transcripts, documents, chat, usage, storage, bot
  );
  return { service, users, sessions, meetings, transcripts, documents, chat, usage, storage, bot };
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

  describe('login', () => {
    it('logs in with the right password', async () => {
      await ctx.service.signup('carol@example.com', 'a-good-password');
      const res = await ctx.service.login('carol@example.com', 'a-good-password');
      const me = await ctx.service.getUserForToken(res.sessionToken);
      expect(me?.email).toBe('carol@example.com');
    });

    it('gives an identical InvalidCredentialsError for unknown email and wrong password', async () => {
      await ctx.service.signup('dave@example.com', 'a-good-password');
      await expect(ctx.service.login('nobody@example.com', 'whatever-pass')).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(ctx.service.login('dave@example.com', 'wrong-password')).rejects.toBeInstanceOf(InvalidCredentialsError);
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
