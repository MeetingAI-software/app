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
import type { PlanEntitlements } from '../domain/billing';

export interface MeetingRepository {
  reserve(input: { ownerUserId: string; source: MeetingSource; meetingUrl?: string;
    platform?: MeetingPlatform; participantNames?: string[];
    recordingNoticeConfirmedAt?: Date; recordingNoticeVersion?: string;
    uploadDurationSeconds?: number },
    entitlements: PlanEntitlements, maxConcurrent: number): Promise<Meeting>;
  create(input: { ownerUserId: string; source: MeetingSource; meetingUrl?: string;
    platform?: MeetingPlatform; participantNames?: string[];
    recordingNoticeConfirmedAt?: Date; recordingNoticeVersion?: string }): Promise<Meeting>;
  findById(id: string): Promise<Meeting | null>;
  findByBotId(botId: string): Promise<Meeting | null>;
  /** One durable transcript processor per bound bot, across all workers and event IDs. */
  claimBotTranscript(id: string, botId: string, claimId: string): Promise<boolean>;
  /** Release only this processor's claim after a retryable pre-completion failure. */
  releaseBotTranscript(id: string, claimId: string): Promise<void>;
  findByShareToken(token: string): Promise<Meeting | null>;
  enableShare(id: string, userId: string, expiresAt: Date): Promise<Meeting | null>;
  revokeShare(id: string, userId: string): Promise<boolean>;
  findByTranscriptionJobId(jobId: string): Promise<Meeting | null>;   // Day 3: map a transcription webhook back to its meeting
  /** Claim the one possible paid transcription submit before calling the provider. */
  claimUploadSubmission(id: string): Promise<boolean>;
  /** Bind the returned provider job at most once to the claimed upload. */
  bindTranscriptionJob(id: string, jobId: string): Promise<boolean>;
  /** Fail and release an upload only after a definite pre-job provider rejection. */
  failRejectedUploadSubmission(id: string, reason: string): Promise<void>;
  updateStatus(id: string, to: MeetingStatus,
    patch?: Partial<Pick<Meeting, 'botId' | 'durationSeconds' | 'errorMessage'>>): Promise<Meeting>;
  setSummary(id: string, summary: string): Promise<void>;
  setShareEnabled(id: string, userId: string, enabled: boolean): Promise<Meeting | null>;   // owner-scoped: turn a public link on or off
  rotateShareToken(id: string, userId: string): Promise<Meeting | null>;                    // owner-scoped: mint a new token; the old link dies
  setUploadInfo(id: string, patch: { audioStoragePath?: string | null;
    transcriptionJobId?: string }): Promise<void>;                    // Day 3: upload path
  countActive(): Promise<number>;   // includes pending; informational, not an admission gate
  list(): Promise<Meeting[]>;
  findByIdForUser(id: string, userId: string): Promise<Meeting | null>;   // Day 5: owner-scoped read (HTTP uses ONLY this)
  listForUser(userId: string): Promise<Meeting[]>;   // Day 5: owner-scoped, newest first
  countActiveForUser(userId: string): Promise<number>;   // informational; use reserve() for admission
  deleteById(id: string): Promise<void>;             // Day 5: account erasure
  findTranscribedOlderThan?(hours: number): Promise<Meeting[]>;
  findFailedWithAudioOlderThan?(hours: number): Promise<Meeting[]>;
  findFailedBotMediaOlderThan(hours: number): Promise<Meeting[]>;
  /** Acknowledge deletion only for the same terminal meeting and bot ID. */
  markBotMediaDeleted(meetingId: string, botId: string): Promise<boolean>;
  findStuckActiveOlderThan?(minutes: number): Promise<Meeting[]>;
}

export interface DocumentRepository {
  claimGeneration(meetingId: string, regenerate: boolean): Promise<
    | { status: 'claimed'; claimId: string }
    | { status: 'cached'; document: { content: DocumentContent; createdAt: Date } }
    | { status: 'pending' }
    | { status: 'limit' }
  >;
  completeGeneration(meetingId: string, claimId: string, content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }): Promise<void>;
  failGeneration(meetingId: string, claimId: string): Promise<void>;
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
  /** Commit sequence order per meeting: no lower seq may become visible after a higher one. */
  append(meetingId: string, seg: TranscriptSegment): Promise<LiveTranscriptSegment>;
  /** Strictly greater than `afterSeq`, oldest first. Pass 0 to read from the start. */
  listSince(meetingId: string, afterSeq: number, limit?: number): Promise<LiveTranscriptSegment[]>;
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
  /** null conservatively settles the meeting's full reserved duration. */
  addSeconds(meetingId: string, seconds: number | null): Promise<number>;
  monthlyTotalSeconds(userId: string): Promise<number>;   // current calendar month, owner-scoped
  deleteByMeeting(meetingId: string): Promise<void>;            // Day 5: account erasure
}

export interface ChatMessageRepository {
  /** Atomically reserve one paid question before the model call. */
  claimQuestion(meetingId: string, limit: number, question: string): Promise<{ id: string; remaining: number }>;
  /** Publish both sides of a completed exchange in one transaction. */
  completeQuestion(id: string, answer: string, tokens: { input: number; output: number }): Promise<void>;
  /** Release a claim only before any provider request was started. */
  releaseQuestion(id: string): Promise<void>;
  add(meetingId: string, role: 'user' | 'assistant', content: string,
      tokens?: { input: number; output: number }): Promise<void>;
  listByMeeting(meetingId: string): Promise<ChatMessage[]>;     // oldest first
  countUserMessages(meetingId: string): Promise<number>;        // the cap counter
  deleteByMeeting(meetingId: string): Promise<void>;            // Day 5: account erasure
}

export interface ChatQuestionRepository extends ChatMessageRepository {
  /** Count an uncertain provider outcome against the cap without leaving an in-flight lock. */
  markQuestionOutcomeUnknown(id: string): Promise<void>;
}

// Day 5: accounts + sessions
export interface UserRepository {
  create(input: {
    email: string;
    passwordHash?: string | null;
    googleId?: string | null;
    emailVerified?: boolean;
    organizationName?: string | null;
    businessUseConfirmedAt?: Date | null;
    termsVersionAccepted?: string | null;
  }): Promise<User & { authVersion: number }>;
  /** Includes passwordHash — for AuthService only. */
  findByEmailWithHash(email: string): Promise<(User & { passwordHash: string | null; googleId?: string | null; authVersion: number }) | null>;
  findByGoogleId(googleId: string): Promise<(User & { authVersion: number }) | null>;
  linkGoogleId(input: { userId: string; googleId: string; email: string;
    expectedAuthVersion: number }): Promise<boolean>;
  markEmailVerified(id: string): Promise<void>;
  findById(id: string): Promise<User | null>;
  updatePassword(id: string, passwordHash: string, expectedAuthVersion: number): Promise<number>;
  updateEmail(id: string, email: string, expectedAuthVersion: number): Promise<User>;
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
  replaceForUser(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<{ email: string }>;
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  /** The user's single live token (unique index on user_id) — backs the resend cooldown. */
  findForUser(userId: string): Promise<EmailVerificationToken | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Deletes tokens at or past their expiry and returns only the number removed. */
  deleteExpired(now: Date): Promise<number>;
  consumeAndVerify(input: {
    tokenHash: string;
    now: Date;
    passwordHash: string;
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
 * Admission must serialize the rolling-window count and insert across all API replicas.
 */
export interface EmailSendLedgerRepository {
  /** Rows created at or after `since`. */
  countSince(since: Date): Promise<number>;
  /** Claim one send in a transaction, or return false when the shared budget is exhausted. */
  tryReserve(input: { userId: string | null; trigger: EmailSendTrigger;
    since: Date; now: Date; limit: number }): Promise<boolean>;
  /** Claim the global send slot, account cooldown and replacement token in one transaction. */
  tryReserveAndIssue(input: { userId: string; trigger: EmailSendTrigger;
    since: Date; now: Date; limit: number; cooldownMs: number;
    tokenHash: string; expiresAt: Date }): Promise<{ status: 'issued'; email: string }
      | { status: 'cooldown' | 'budget' | 'already_verified' }>;
  record(input: { userId: string | null; trigger: EmailSendTrigger }): Promise<void>;
  /** Retention janitor, mirroring SessionRepository.deleteExpired. Returns the count removed. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export interface SessionRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date; authVersion?: number }): Promise<Session>;
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
  /** Bind only a newly created or explicitly unowned customer to the authenticated app user. */
  attachCustomerToUser(input: { customerId: string; email: string; userId: string }): Promise<boolean>;
  /** Synchronize provider contact details without changing the local owner. */
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
  /** Removes the local email/user link while retaining provider IDs needed for billing records. */
  anonymizeCustomerForUser?(userId: string): Promise<void>;
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
