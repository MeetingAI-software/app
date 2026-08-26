import type {
  EmailVerificationToken,
  Meeting,
  MeetingPlatform,
  MeetingSource,
  MeetingStatus,
  Session,
  TranscriptSegment,
  User,
} from '../domain/types';
import type { DocumentContent } from '../domain/document';
import type { ChatMessage } from './chat.port';

export interface MeetingRepository {
  create(input: { ownerUserId: string; source: MeetingSource; meetingUrl?: string;
    platform?: MeetingPlatform; participantNames?: string[] }): Promise<Meeting>;
  findById(id: string): Promise<Meeting | null>;
  findByBotId(botId: string): Promise<Meeting | null>;
  findByShareToken(token: string): Promise<Meeting | null>;
  findByTranscriptionJobId(jobId: string): Promise<Meeting | null>;   // Day 3: map a transcription webhook back to its meeting
  updateStatus(id: string, to: MeetingStatus,
    patch?: Partial<Pick<Meeting, 'botId' | 'durationSeconds' | 'errorMessage'>>): Promise<Meeting>;
  setSummary(id: string, summary: string): Promise<void>;
  setUploadInfo(id: string, patch: { audioStoragePath?: string | null;
    transcriptionJobId?: string }): Promise<void>;                    // Day 3: upload path
  countActive(): Promise<number>;   // status in (bot_joining, recording, processing)
  list(): Promise<Meeting[]>;
  findByIdForUser(id: string, userId: string): Promise<Meeting | null>;   // Day 5: owner-scoped read (HTTP uses ONLY this)
  listForUser(userId: string): Promise<Meeting[]>;   // Day 5: owner-scoped, newest first
  countActiveForUser(userId: string): Promise<number>;   // Day 5: per-user concurrency cap
  deleteById(id: string): Promise<void>;             // Day 5: account erasure
  findTranscribedOlderThan?(hours: number): Promise<Meeting[]>;
  findStuckActiveOlderThan?(minutes: number): Promise<Meeting[]>;
}

export interface DocumentRepository {
  upsertForMeeting(meetingId: string, content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }): Promise<{ id: string }>;
  getByMeetingId(meetingId: string): Promise<{ content: DocumentContent; createdAt: Date } | null>;
  deleteByMeeting(meetingId: string): Promise<void>;            // Day 5: account erasure
}

export interface TranscriptRepository {
  save(meetingId: string, segments: TranscriptSegment[], rawPayload: unknown): Promise<void>;
  getByMeetingId(meetingId: string): Promise<TranscriptSegment[] | null>;
  deleteByMeeting(meetingId: string): Promise<void>;            // Day 5: account erasure
}

/**
 * Live utterances captured while the meeting is still running. Append-only and disposable:
 * the post-call transcript from `TranscriptRepository` supersedes these rows, which are then
 * deleted. `seq` is monotonic and global, and is the cursor for both SSE replay and polling.
 */
export interface LiveTranscriptRepository {
  append(meetingId: string, seg: TranscriptSegment): Promise<LiveTranscriptSegment>;
  /** Strictly greater than `afterSeq`, oldest first. Pass 0 to read from the start. */
  listSince(meetingId: string, afterSeq: number): Promise<LiveTranscriptSegment[]>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface LiveTranscriptSegment extends TranscriptSegment {
  seq: number;
}

export interface WebhookEventRepository {
  /** Idempotency: returns false if externalEventId already exists (duplicate delivery). */
  insertIfNew(e: { provider: string; externalEventId: string;
                   eventType: string; payload: unknown }): Promise<boolean>;
  claimNextPending(): Promise<{ id: string; eventType: string; payload: unknown } | null>; // FOR UPDATE SKIP LOCKED
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, attempts: number, nextAttemptAt: Date): Promise<void>;
}

export interface UsageRepository {
  addSeconds(meetingId: string, seconds: number): Promise<void>;
  monthlyTotalSeconds(userId: string): Promise<number>;   // current calendar month, owner-scoped
  deleteByMeeting(meetingId: string): Promise<void>;            // Day 5: account erasure
}

export interface ChatMessageRepository {
  add(meetingId: string, role: 'user' | 'assistant', content: string,
      tokens?: { input: number; output: number }): Promise<void>;
  listByMeeting(meetingId: string): Promise<ChatMessage[]>;     // oldest first
  countUserMessages(meetingId: string): Promise<number>;        // the cap counter
  deleteByMeeting(meetingId: string): Promise<void>;            // Day 5: account erasure
}

// Day 5: accounts + sessions
export interface UserRepository {
  create(input: { email: string; passwordHash?: string | null; googleId?: string | null; emailVerified?: boolean }): Promise<User>;
  /** Includes passwordHash — for AuthService only. */
  findByEmailWithHash(email: string): Promise<(User & { passwordHash: string | null; googleId?: string | null }) | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  linkGoogleId(id: string, googleId: string): Promise<void>;
  markEmailVerified(id: string): Promise<void>;
  findById(id: string): Promise<User | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;         // account settings: change password
  updateEmail(id: string, email: string): Promise<User>;                   // lowercased; unique-violation → EmailTakenError
  deleteById(id: string): Promise<void>;
}

export type VerificationTokenConsumeResult =
  | { status: 'verified'; user: User }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'already_verified' };

export interface VerificationTokenRepository {
  /** Atomically invalidates the user's previous token and stores the replacement. */
  replaceForUser(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  /** The user's single live token (unique index on user_id) — backs the resend cooldown. */
  findForUser(userId: string): Promise<EmailVerificationToken | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Deletes tokens at or past their expiry and returns only the number removed. */
  deleteExpired(now: Date): Promise<number>;
  consumeAndVerify(input: {
    tokenHash: string;
    now: Date;
  }): Promise<VerificationTokenConsumeResult>;
}

/** What triggered a verification email — the breakdown you need when the daily budget blows. */
export type EmailSendTrigger = 'signup' | 'resend' | 'change_email';

/**
 * Append-only record of verification emails spent, backing the global daily send budget.
 *
 * `countSince` takes the window start rather than computing it, so the service owns the clock and
 * the window constant — which is what keeps the budget testable without a database.
 *
 * Read-then-write is only near-atomic, which is fine at one replica: the gap is a single Postgres
 * round-trip, so overshoot is a row or two against 70 emails of headroom. If numReplicas ever
 * exceeds 1, replace this with an atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`.
 */
export interface EmailSendLedgerRepository {
  /** Rows created at or after `since`. */
  countSince(since: Date): Promise<number>;
  record(input: { userId: string | null; trigger: EmailSendTrigger }): Promise<void>;
  /** Retention janitor, mirroring SessionRepository.deleteExpired. Returns the count removed. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export interface SessionRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  /** Day 6 §3: deletes all sessions with expires_at < now(). Returns the count removed. */
  deleteExpired(): Promise<number>;
}

export interface PaddleBillingRepository {
  findCustomerForUser(userId: string): Promise<{
    customerId: string;
    subscriptionIds: string[];
  } | null>;
  findCustomerByEmail(email: string): Promise<{
    customerId: string;
    subscriptionIds: string[];
  } | null>;
  upsertCustomer(input: {
    customerId: string;
    email: string;
  }): Promise<void>;
  upsertSubscription(input: {
    subscriptionId: string;
    customerId: string;
    status: string;
    priceId: string | null;
    productId: string | null;
    quantity: number;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    scheduledChangeAction: string | null;
    scheduledChangeAt: Date | null;
    occurredAt: Date;
  }): Promise<void>;
  listSubscriptionsForUser(userId: string): Promise<PaddleSubscriptionRecord[]>;
}

export interface PaddleSubscriptionRecord {
  subscriptionId: string;
  status: string;
  priceId: string | null;
  productId: string | null;
  quantity: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  scheduledChangeAction: string | null;
  scheduledChangeAt: Date | null;
  lastEventAt: Date;
}


/** Which pre-launch dialog an address was left in — the only intent signal a waitlist row carries. */
export type WaitlistSource = 'signin' | 'upgrade';

/**
 * Pre-launch waitlist. `add` is idempotent on the address: the endpoint behind it is public and
 * unauthenticated, so a repeated submission must be a no-op, never a duplicate row or an error the
 * visitor sees.
 */
export interface WaitlistRepository {
  /** Returns false when the address was already on the list. */
  add(input: { email: string; source: WaitlistSource }): Promise<boolean>;
  count(): Promise<number>;
}
