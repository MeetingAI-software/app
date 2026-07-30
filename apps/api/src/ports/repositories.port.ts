import type {
  EmailVerificationToken,
  Meeting,
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
    participantNames?: string[] }): Promise<Meeting>;
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
  deleteByTokenHash(tokenHash: string): Promise<void>;
  consumeAndVerify(input: {
    tokenHash: string;
    now: Date;
  }): Promise<VerificationTokenConsumeResult>;
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

