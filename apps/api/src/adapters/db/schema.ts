// adapters/db/schema.ts
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingUrl: text('meeting_url'),                                  // Day 3: nullable — uploads have no URL
  platform: text('platform').notNull().default('zoom'),
  status: text('status').notNull().default('pending'),
  source: text('source').notNull().default('bot'),                 // Day 3: 'bot' | 'upload'
  botId: text('bot_id'),
  durationSeconds: integer('duration_seconds'),
  errorMessage: text('error_message'),
  summary: text('summary'),
  shareToken: text('share_token').notNull().unique(),
  participantNames: jsonb('participant_names'),                    // Day 3: string[] entered before an in-room recording
  audioStoragePath: text('audio_storage_path'),                   // Day 3: Supabase Storage path for uploads
  transcriptionJobId: text('transcription_job_id'),               // Day 3: AssemblyAI job id for uploads
  ownerUserId: uuid('owner_user_id').references(() => users.id),   // Day 5: null = unclaimed legacy row
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  meetingsStatusIdx: index('meetings_status_idx').on(t.status),
  meetingsBotIdIdx: index('meetings_bot_id_idx').on(t.botId),
  meetingsOwnerUserIdIdx: index('meetings_owner_user_id_idx').on(t.ownerUserId),
}));

export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id),
  segments: jsonb('segments').notNull(),        // TranscriptSegment[] — timestamps + speakers ALWAYS
  rawPayload: jsonb('raw_payload').notNull(),   // exact provider response, for reprocessing
  language: text('language'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),                      // 'recall' | 'fake'
  externalEventId: text('external_event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  webhookEventsExternalIdUq: uniqueIndex('webhook_events_external_id_uq').on(t.externalEventId),
}));

export const usageLedger = pgTable('usage_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id),
  secondsRecorded: integer('seconds_recorded').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id).unique(),
  content: jsonb('content').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id),
  role: text('role').notNull(),                 // 'user' | 'assistant'
  content: text('content').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  chatMessagesMeetingIdx: index('chat_messages_meeting_id_created_at_idx').on(t.meetingId, t.createdAt),
}));

// Day 5: accounts + sessions
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),                        // lowercased by the app
  passwordHash: text('password_hash'),                            // nullable for OAuth users
  googleId: text('google_id').unique(),                           // Google OAuth sub ID
  emailVerified: boolean('email_verified').notNull().default(false), // true for OAuth / verified
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  verificationUserIdIdx: index('verification_user_id_idx').on(t.userId),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),               // sha256(opaque token); raw token lives only in the cookie
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionsUserIdIdx: index('sessions_user_id_idx').on(t.userId),
}));

