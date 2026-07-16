// adapters/db/schema.ts
import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingUrl: text('meeting_url').notNull(),
  platform: text('platform').notNull().default('zoom'),
  status: text('status').notNull().default('pending'),
  botId: text('bot_id'),
  durationSeconds: integer('duration_seconds'),
  errorMessage: text('error_message'),
  summary: text('summary'),
  shareToken: text('share_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  meetingsStatusIdx: index('meetings_status_idx').on(t.status),
  meetingsBotIdIdx: index('meetings_bot_id_idx').on(t.botId),
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

