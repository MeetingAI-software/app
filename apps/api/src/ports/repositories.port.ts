import type { Meeting, MeetingStatus, TranscriptSegment } from '../domain/types';
import type { DocumentContent } from '../domain/document';

export interface MeetingRepository {
  create(input: { meetingUrl: string }): Promise<Meeting>;
  findById(id: string): Promise<Meeting | null>;
  findByBotId(botId: string): Promise<Meeting | null>;
  findByShareToken(token: string): Promise<Meeting | null>;
  updateStatus(id: string, to: MeetingStatus,
    patch?: Partial<Pick<Meeting, 'botId' | 'durationSeconds' | 'errorMessage'>>): Promise<Meeting>;
  setSummary(id: string, summary: string): Promise<void>;
  countActive(): Promise<number>;   // status in (bot_joining, recording, processing)
  list(): Promise<Meeting[]>;
}

export interface DocumentRepository {
  upsertForMeeting(meetingId: string, content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }): Promise<{ id: string }>;
  getByMeetingId(meetingId: string): Promise<{ content: DocumentContent; createdAt: Date } | null>;
}

export interface TranscriptRepository {
  save(meetingId: string, segments: TranscriptSegment[], rawPayload: unknown): Promise<void>;
  getByMeetingId(meetingId: string): Promise<TranscriptSegment[] | null>;
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
  monthlyTotalSeconds(): Promise<number>;   // current calendar month
}

export interface DocumentRepository {
  upsertForMeeting(meetingId: string, content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }): Promise<{ id: string }>;
  getByMeetingId(meetingId: string): Promise<{ content: DocumentContent; createdAt: Date } | null>;
}

