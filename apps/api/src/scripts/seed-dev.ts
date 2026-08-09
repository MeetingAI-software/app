/**
 * Seeds the local development database with a small, entirely fabricated dataset.
 *
 * The point is to make a safe local database *usable*. An empty database is the reason people
 * reach for production credentials, so the fix for "local dev is inconvenient" has to ship
 * alongside the guard that makes production unreachable — otherwise the guard is just an obstacle
 * and someone eventually removes it.
 *
 * Everything here is invented. Regulators are explicit that production personal data must not be
 * copied into a development environment (CNIL's developer guide, Sheet n°11: build a dummy data
 * set); this script is that dummy data set, and there is deliberately no "pull from production"
 * mode to be tempted by.
 *
 * Content is borrowed from the existing fake adapters rather than duplicated, so the seeded rows
 * keep the same shape the app produces at runtime.
 *
 *   npm run db:seed -w api
 */
import crypto from 'crypto';
import { db } from '../adapters/db/client';
import { chatMessages, documents, meetings, transcripts, usageLedger, users } from '../adapters/db/schema';
import { config } from '../config/env';
import { isLocalDatabaseUrl } from '../adapters/db/remote-database-guard';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import { FakeDocumentGenerator } from '../adapters/fake/fake-document.generator';
import { FakeTranscriptionAdapter } from '../adapters/fake/fake-transcription.adapter';
import { eq } from 'drizzle-orm';

const SEED_EMAIL = 'dev@localhost';
const SEED_PASSWORD = 'devpassword123';

function shareToken(): string {
  // Same generation as MeetingRepository.create, so seeded share links behave like real ones.
  return crypto.randomBytes(16).toString('base64url');
}

async function seed() {
  if (!isLocalDatabaseUrl(config.DATABASE_URL)) {
    console.error('❌ Refusing to seed a database that is not local.');
    console.error('   This script writes fabricated users and meetings in bulk. There is no');
    console.error('   situation in which that belongs in production, so there is no override.');
    console.error('   Point DATABASE_URL at the local container and try again:');
    console.error('     docker compose up -d');
    console.error('   See docs/local-development.md.');
    process.exit(1);
  }

  console.log('🌱 Seeding local development data...');

  // Idempotent: re-running replaces the seeded user's data rather than piling up duplicates, so
  // `npm run db:seed -w api` is safe to reach for whenever local data gets into a confusing state.
  const [existing] = await db.select().from(users).where(eq(users.email, SEED_EMAIL));
  if (existing) {
    console.log('   Existing seed user found — clearing its data first.');
    const owned = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.ownerUserId, existing.id));
    for (const { id } of owned) {
      // Order matters: children before parents, since these are real foreign keys.
      await db.delete(chatMessages).where(eq(chatMessages.meetingId, id));
      await db.delete(documents).where(eq(documents.meetingId, id));
      await db.delete(usageLedger).where(eq(usageLedger.meetingId, id));
      await db.delete(transcripts).where(eq(transcripts.meetingId, id));
      await db.delete(meetings).where(eq(meetings.id, id));
    }
    await db.delete(users).where(eq(users.id, existing.id));
  }

  const hasher = new Argon2Hasher();
  const [user] = await db
    .insert(users)
    .values({
      email: SEED_EMAIL,
      passwordHash: await hasher.hash(SEED_PASSWORD),
      // Pre-verified so local sign-in works without a mail provider: EMAIL_PROVIDER=log only
      // prints the link, and clicking through a printed link every reset is pure friction.
      emailVerified: true,
    })
    .returning();

  // fetchResult() ignores the webhook repository — only submit() uses it, and the seed never
  // submits — so the constructor argument is deliberately a stub.
  const segments = await new FakeTranscriptionAdapter({} as never).fetchResult('seed');
  const docGen = new FakeDocumentGenerator();
  const summary = await docGen.generateSummary(segments);
  const generated = await docGen.generateDocument(segments, { meetingIsoDate: '2026-07-16' });

  // Three meetings covering the states the UI actually branches on: a finished one with a
  // transcript, summary, document and chat history; one still recording; one that failed.
  const [done] = await db
    .insert(meetings)
    .values({
      meetingUrl: 'https://zoom.us/j/seed-completed',
      platform: 'zoom',
      // 'transcribed' is the terminal success state (see ALLOWED_TRANSITIONS) — there is no 'done'.
      status: 'transcribed',
      source: 'bot',
      botId: 'seed-bot-transcribed',
      durationSeconds: 1800,
      summary,
      shareToken: shareToken(),
      ownerUserId: user.id,
    })
    .returning();

  await db.insert(transcripts).values({
    meetingId: done.id,
    segments,
    rawPayload: { provider: 'seed', note: 'fabricated transcript, not from any real meeting' },
    language: 'en',
  });

  await db.insert(documents).values({
    meetingId: done.id,
    content: generated.content,
    model: generated.model,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
  });

  await db.insert(usageLedger).values({ meetingId: done.id, secondsRecorded: 1800 });

  await db.insert(chatMessages).values([
    { meetingId: done.id, role: 'user', content: 'What did we decide about deleting the audio?' },
    {
      meetingId: done.id,
      role: 'assistant',
      content: 'Provider-side audio is deleted only after the transcript is stored and the summary has been generated (09:30).',
    },
  ]);

  await db.insert(meetings).values({
    meetingUrl: 'https://meet.google.com/seed-recording',
    platform: 'google_meet',
    status: 'recording',
    source: 'bot',
    botId: 'seed-bot-recording',
    shareToken: shareToken(),
    ownerUserId: user.id,
  });

  await db.insert(meetings).values({
    meetingUrl: 'https://teams.microsoft.com/l/seed-failed',
    platform: 'teams',
    status: 'failed',
    source: 'bot',
    errorMessage: 'Seed: bot could not join the meeting',
    shareToken: shareToken(),
    ownerUserId: user.id,
  });

  console.log('✅ Seeded 1 user and 3 meetings.');
  console.log(`   Sign in with  ${SEED_EMAIL}  /  ${SEED_PASSWORD}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
