import crypto from 'crypto';
import type { User } from '../domain/types';
import type {
  UserRepository,
  SessionRepository,
  MeetingRepository,
  TranscriptRepository,
  DocumentRepository,
  ChatMessageRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { AudioStoragePort } from '../ports/audio-storage.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import {
  EmailAlreadyVerifiedError,
  EmailSendBudgetExhaustedError,
  ExpiredVerificationTokenError,
  InvalidCredentialsError,
  InvalidVerificationTokenError,
  UsedVerificationTokenError,
  VerificationNotPersistedError,
  WeakPasswordError,
} from '../domain/errors';
import { logger } from '../config/logger';
import type { EmailSendBudget } from './email-send-budget.service';
import type { EmailVerificationTokenService } from './email-verification-token.service';
import type { EmailVerificationDelivery } from './email-verification-delivery.service';

export interface AuthResult {
  user: User;
  sessionToken: string; // the RAW token — goes into the httpOnly cookie, never stored
  expiresAt: Date;
}

export interface AuthServiceApi {
  signup(email: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  logout(sessionToken: string): Promise<void>;
  getUserForToken(sessionToken: string): Promise<User | null>;
  verifyEmail(token: string): Promise<User>;
  resendVerification(email: string): Promise<void>;
  /** Verify current password, set a new one, rotate sessions (returns a fresh session for the caller). */
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult>;
  /** Verify current password, then change the (unverified) email. EmailTakenError on collision. */
  changeEmail(userId: string, currentPassword: string, newEmail: string): Promise<User>;
  deleteAccount(userId: string, currentPassword: string): Promise<void>;
}

const MIN_PASSWORD_LENGTH = 10; // §2 policy: length ≥ 10, no composition theater
const SESSION_TOKEN_BYTES = 32;

/** sha256 of the opaque token. Only the hash is ever persisted; a DB leak yields no live cookies. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The auth brain (Day 5 §3/§6). Owns account lifecycle and sessions; knows nothing about HTTP,
 * cookies, or Postgres — those live in adapters. Session TTL and every collaborator are injected,
 * so the whole thing is testable with fakes + a real hasher.
 */
export class AuthService implements AuthServiceApi {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessionTtlDays: number,
    // Erasure collaborators (§6) — used only by deleteAccount.
    private readonly meetings: MeetingRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly documents: DocumentRepository,
    private readonly chat: ChatMessageRepository,
    private readonly usage: UsageRepository,
    private readonly storage: AudioStoragePort,
    private readonly bot: MeetingBotPort,
    private readonly verificationTokens: EmailVerificationTokenService,
    private readonly verificationDelivery: EmailVerificationDelivery,
    private readonly sendBudget: EmailSendBudget,
  ) {}

  async signup(email: string, password: string): Promise<AuthResult> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const passwordHash = await this.hasher.hash(password);
    const user = await this.users.create({ email, passwordHash, emailVerified: false });
    logger.info({ userId: user.id }, 'User signed up');
    try {
      await this.verificationDelivery.sendTo(user, 'signup');
    } catch (err) {
      // The account already exists at this point. Keep signup usable and let the user retry from
      // the verification notice instead of returning an error that encourages a duplicate signup.
      // An exhausted send budget lands here too, deliberately: throwing would leave a ghost account
      // whose retry 409s, which is strictly worse than an unverified one they can resend from.
      logger.error({ userId: user.id, err: msg(err) }, 'Initial verification email delivery failed');
    }
    return this.startSession(user);
  }

  async verifyEmail(token: string): Promise<User> {
    const result = await this.verificationTokens.consumeAndVerify(token);
    if (result.status === 'invalid') throw new InvalidVerificationTokenError();
    if (result.status === 'expired') throw new ExpiredVerificationTokenError();
    if (result.status === 'used') throw new UsedVerificationTokenError();
    if (result.status === 'already_verified') throw new EmailAlreadyVerifiedError();

    // Read back outside the transaction before we tell anyone this worked. A pooler can hand back a
    // committed-looking result whose writes were dropped, and reporting that as success is the worst
    // outcome available: the user sees "verified", the row says otherwise, and nothing looks broken.
    const persisted = await this.users.findById(result.user.id);
    if (!persisted?.emailVerified) {
      logger.error({ userId: result.user.id }, 'Verification transaction reported success but did not persist');
      throw new VerificationNotPersistedError();
    }

    logger.info({ userId: persisted.id }, 'Email verified successfully');
    return persisted;
  }

  async resendVerification(email: string): Promise<void> {
    // Before the lookup, not inside the send. This route returns early for unknown and already
    // verified addresses, so a budget error raised further down would surface only for real
    // unverified accounts — a free enumeration oracle, exactly what the neutral 200 exists to
    // prevent. Exhaustion is a global condition, so answering it identically for every caller
    // leaks nothing about any account.
    if (!(await this.sendBudget.hasRemaining())) throw new EmailSendBudgetExhaustedError();

    const user = await this.users.findByEmailWithHash(email);
    if (!user || user.emailVerified) return;
    // Suppressed silently: the route always answers with the same neutral 200 regardless, so
    // reporting the cooldown here would hand back an account-existence oracle for free.
    if (await this.verificationTokens.isWithinResendCooldown(user.id)) {
      logger.info({ userId: user.id }, 'Verification resend suppressed by cooldown');
      return;
    }
    await this.verificationDelivery.sendTo(user, 'resend');
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const record = await this.users.findByEmailWithHash(email);
    if (!record) {
      // Spend a verify against a throwaway hash so an unknown email costs ~the same time as a
      // wrong password — no user enumeration by timing, and the error is identical either way.
      await this.hasher.verify(password, await this.getDummyHash());
      throw new InvalidCredentialsError('Invalid email or password');
    }
    const ok = record.passwordHash ? await this.hasher.verify(password, record.passwordHash) : false;
    if (!ok) {
      throw new InvalidCredentialsError('Invalid email or password');
    }
    const { passwordHash: _omit, ...user } = record;
    logger.info({ userId: user.id }, 'User logged in');
    return this.startSession(user);
  }

  async loginOrCreateGoogleUser(email: string, googleId: string): Promise<AuthResult> {
    // 1. Try finding by Google ID
    let user = await this.users.findByGoogleId(googleId);
    if (!user) {
      // 2. Try finding by email
      const existing = await this.users.findByEmailWithHash(email);
      if (existing) {
        // Link existing user to Google ID
        await this.users.linkGoogleId(existing.id, googleId);
        const { passwordHash: _omit, ...existingUser } = existing;
        user = { ...existingUser, emailVerified: true };
      } else {
        // Create new user with Google ID
        user = await this.users.create({ email, googleId, emailVerified: true });
        logger.info({ userId: user.id }, 'User signed up via Google OAuth');
      }
    } else {
      if (!user.emailVerified) {
        // Repair legacy OAuth accounts created before verification status was persisted correctly.
        await this.users.markEmailVerified(user.id);
        user = { ...user, emailVerified: true };
      }
      logger.info({ userId: user.id }, 'User logged in via Google OAuth');
    }
    return this.startSession(user);
  }

  async logout(sessionToken: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashToken(sessionToken));
  }

  async getUserForToken(sessionToken: string): Promise<User | null> {
    const tokenHash = hashToken(sessionToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.deleteByTokenHash(tokenHash); // lazy cleanup of expired sessions
      return null;
    }
    return this.users.findById(session.userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult> {
    const record = await this.requirePassword(userId, currentPassword);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const passwordHash = await this.hasher.hash(newPassword);
    await this.users.updatePassword(userId, passwordHash);
    // Rotate every session (defence: a changed password logs out all other devices), then hand
    // the current caller a fresh session so they stay signed in on this one.
    await this.sessions.deleteAllForUser(userId);
    const { passwordHash: _omit, ...user } = record;
    logger.info({ userId }, 'Password changed; all sessions rotated');
    return this.startSession(user);
  }

  async changeEmail(userId: string, currentPassword: string, newEmail: string): Promise<User> {
    await this.requirePassword(userId, currentPassword);
    const updated = await this.users.updateEmail(userId, newEmail); // EmailTakenError bubbles up
    logger.info({ userId }, 'Email changed');
    try {
      // No cooldown check here on purpose. This is the only escape hatch for a mistyped address on
      // a gated account, and the signup token is seconds old — gating it would make "sign up, spot
      // the typo, fix it" save the new address, send nothing, and report success, stranding the
      // user permanently. Bounded instead by the per-account route limiter and the global budget.
      await this.verificationDelivery.sendTo(updated, 'change_email');
    } catch (err) {
      logger.error({ userId, err: msg(err) }, 'Verification email delivery after address change failed');
    }
    return updated;
  }

  async deleteAccount(userId: string, currentPassword: string): Promise<void> {
    // Re-confirm the password before this irreversible action.
    await this.requirePassword(userId, currentPassword);

    // §6 erasure order: purge provider-side media first (idempotent, non-fatal), then DB children
    // → meetings → sessions → user. Logged throughout — this is the GDPR audit trail.
    const owned = await this.meetings.listForUser(userId);
    logger.info({ userId, meetingCount: owned.length }, 'Account erasure: begin');

    for (const m of owned) {
      if (m.audioStoragePath) {
        try {
          await this.storage.delete(m.audioStoragePath);
        } catch (err) {
          logger.warn({ userId, meetingId: m.id, err: msg(err) }, 'Account erasure: audio delete failed (continuing)');
        }
      }
      if (m.source === 'bot' && m.botId) {
        try {
          await this.bot.deleteRecording(m.botId);
        } catch (err) {
          logger.warn({ userId, meetingId: m.id, err: msg(err) }, 'Account erasure: recording delete failed (continuing)');
        }
      }
      await this.chat.deleteByMeeting(m.id);
      await this.documents.deleteByMeeting(m.id);
      await this.transcripts.deleteByMeeting(m.id);
      await this.usage.deleteByMeeting(m.id);
      await this.meetings.deleteById(m.id);
      logger.info({ userId, meetingId: m.id }, 'Account erasure: meeting purged');
    }

    await this.sessions.deleteAllForUser(userId);
    await this.users.deleteById(userId);
    logger.info({ userId }, 'Account erasure: complete');
  }

  /** Load a user + verify a plaintext password against their hash, or throw InvalidCredentialsError. */
  private async requirePassword(userId: string, password: string): Promise<User & { passwordHash: string }> {
    const user = await this.users.findById(userId);
    const record = user ? await this.users.findByEmailWithHash(user.email) : null;
    if (!record || !record.passwordHash || !(await this.hasher.verify(password, record.passwordHash))) {
      throw new InvalidCredentialsError('Invalid password');
    }
    return record as User & { passwordHash: string };
  }

  private async startSession(user: User): Promise<AuthResult> {
    const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.sessionTtlDays * 24 * 60 * 60 * 1000);
    await this.sessions.create({ userId: user.id, tokenHash: hashToken(token), expiresAt });
    return { user, sessionToken: token, expiresAt };
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) this.dummyHash = this.hasher.hash('timing-blunt-not-a-real-password');
    return this.dummyHash;
  }
}
