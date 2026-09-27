import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { meetingQuotaReservations, meetings, usageLedger, users } from '../schema';
import { DrizzleMeetingRepository } from './meeting.repository';
import { DrizzleUserRepository } from './user.repository';
import { DrizzleUsageRepository } from './usage.repository';
import { AccountDeletionBlockedError, CapExceededError } from '../../../domain/errors';
import type { PlanEntitlements } from '../../../domain/billing';

vi.mock('../client', () => ({ db }));

const plan: PlanEntitlements = {
  monthlySecondsCap: 3600,
  maxMeetingSeconds: 2000,
  chatQuestionsPerMeeting: 10,
  phoneInRoomRecording: true,
  adminControlsAndAuditLog: false,
};

describe('durable meeting quota admission', () => {
  const meetingsRepo = new DrizzleMeetingRepository();
  const usageRepo = new DrizzleUsageRepository();
  let ownerUserId: string;
  beforeAll(migrateOnce);
  beforeEach(async () => {
    await truncateAll();
    const [owner] = await db.insert(users)
      .values({ email: 'quota@example.test', passwordHash: 'hash' }).returning({ id: users.id });
    ownerUserId = owner.id;
  });

  const bot = (ownerUserId: string) => ({ ownerUserId, source: 'bot' as const,
    meetingUrl: 'https://zoom.us/j/123' });
  const upload = (ownerUserId: string, uploadDurationSeconds = plan.maxMeetingSeconds) =>
    ({ ownerUserId, source: 'upload' as const, uploadDurationSeconds });

  it('reserves the verified upload length and settles silence without transcript time', async () => {
    const recorded = await meetingsRepo.reserve(upload(ownerUserId, 600), plan, 2);
    expect(recorded.durationSeconds).toBe(600);
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, recorded.id));
    expect(claim.reservedSeconds).toBe(600);
    expect(await usageRepo.addSeconds(recorded.id, recorded.durationSeconds)).toBe(600);
    const [charge] = await db.select().from(usageLedger)
      .where(eq(usageLedger.meetingId, recorded.id));
    expect(charge.secondsRecorded).toBe(600);
  });

  it.each([0, -1, 2001, NaN])('rejects unverified or over-plan upload seconds %s', async seconds => {
    await expect(meetingsRepo.reserve(upload(ownerUserId, seconds), plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
    expect(await db.select().from(meetings)).toHaveLength(0);
  });

  it('rejects an upload with no measured duration before creating a meeting', async () => {
    await expect(meetingsRepo.reserve({ ownerUserId, source: 'upload' }, plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
    expect(await db.select().from(meetings)).toHaveLength(0);
  });

  it('admits only one concurrent measured upload at the last monthly capacity', async () => {
    await meetingsRepo.reserve(bot(ownerUserId), plan, 3);
    const results = await Promise.allSettled([
      meetingsRepo.reserve(upload(ownerUserId, 1000), plan, 3),
      new DrizzleMeetingRepository().reserve(upload(ownerUserId, 1000), plan, 3),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });

  it('admits only one of two simultaneous bot starts before any provider work', async () => {
    const results = await Promise.allSettled([
      meetingsRepo.reserve(bot(ownerUserId), plan, 1),
      new DrizzleMeetingRepository().reserve(bot(ownerUserId), plan, 1),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)
      .toBeInstanceOf(CapExceededError);
    expect(await db.select().from(meetings)).toHaveLength(1);
    expect(await db.select().from(meetingQuotaReservations)).toHaveLength(1);
  });

  it('fences reservations and direct inserts once another replica starts account deletion', async () => {
    const userRepo = new DrizzleUserRepository();
    const first = new DrizzleMeetingRepository();
    const second = new DrizzleMeetingRepository();
    await userRepo.beginDeletion(ownerUserId);

    await expect(first.reserve(bot(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(AccountDeletionBlockedError);
    await expect(second.reserve(upload(ownerUserId, 60), plan, 2))
      .rejects.toBeInstanceOf(AccountDeletionBlockedError);
    await expect(second.create({ ownerUserId, source: 'bot', meetingUrl: 'https://zoom.us/j/123' }))
      .rejects.toMatchObject({ cause: expect.objectContaining({
        message: expect.stringMatching(/deletion is in progress/i),
      }) });
    expect(await db.select().from(meetings)).toHaveLength(0);
  });

  it('serializes a reserve against erasure and retains any already admitted unknown bot', async () => {
    const userRepo = new DrizzleUserRepository();
    const first = new DrizzleMeetingRepository();
    const second = new DrizzleMeetingRepository();
    const outcomes = await Promise.allSettled([
      first.reserve(bot(ownerUserId), plan, 2), userRepo.beginDeletion(ownerUserId),
    ]);
    expect(outcomes[1].status).toBe('fulfilled');
    const meetingsAfter = await db.select().from(meetings);
    expect(meetingsAfter.length).toBe(outcomes[0].status === 'fulfilled' ? 1 : 0);
    if (meetingsAfter.length) {
      expect(await second.hasUnresolvedBotClaimForUser(ownerUserId)).toBe(true);
    }
    await expect(second.reserve(bot(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(AccountDeletionBlockedError);
  });

  it('keeps an unknown bot claim after a failure sweep and releases only a definite rejection', async () => {
    const pending = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    await meetingsRepo.updateStatus(pending.id, 'failed', { errorMessage: 'Sweep timeout' });
    expect(await new DrizzleMeetingRepository().hasUnresolvedBotClaimForUser(ownerUserId)).toBe(true);
    const rejected = await meetingsRepo.markBotCreationRejected(pending.id, 'Provider rejected creation');
    expect(rejected.status).toBe('failed');
    expect(await new DrizzleMeetingRepository().hasUnresolvedBotClaimForUser(ownerUserId)).toBe(false);
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, pending.id));
    expect(claim.releasedAt).not.toBeNull();
  });

  it('allows a late returned bot ID to bind while deletion is fenced', async () => {
    const pending = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    await new DrizzleUserRepository().beginDeletion(ownerUserId);
    expect(await meetingsRepo.hasUnresolvedBotClaimForUser(ownerUserId)).toBe(true);
    await new DrizzleMeetingRepository().updateStatus(pending.id, 'bot_joining', { botId: 'late-bot' });
    expect(await meetingsRepo.hasUnresolvedBotClaimForUser(ownerUserId)).toBe(false);
    expect((await meetingsRepo.findById(pending.id))?.botId).toBe('late-bot');
  });

  it('persists a late bot ID after a sweep failure without reopening the terminal meeting', async () => {
    const pending = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    await new DrizzleUserRepository().beginDeletion(ownerUserId);
    await new DrizzleMeetingRepository().updateStatus(pending.id, 'failed', {
      errorMessage: 'Sweep timed out while createBot was still in flight',
    });
    const [claimAfterSweep] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, pending.id));
    expect(claimAfterSweep.releasedAt).toBeNull();

    const bound = await meetingsRepo.bindCreatedBot(pending.id, 'late-after-sweep');
    expect(bound).toMatchObject({ status: 'failed', botId: 'late-after-sweep' });
    expect(await new DrizzleMeetingRepository().hasUnresolvedBotClaimForUser(ownerUserId)).toBe(false);
    expect((await meetingsRepo.findById(pending.id))?.botId).toBe('late-after-sweep');
    const [claimAfterBind] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, pending.id));
    expect(claimAfterBind.releasedAt).toBeNull();
  });

  it('shares the same monthly claim across bots and uploads even with two concurrency slots', async () => {
    const results = await Promise.allSettled([
      meetingsRepo.reserve(bot(ownerUserId), plan, 2),
      meetingsRepo.reserve(upload(ownerUserId), plan, 2),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await db.select().from(meetingQuotaReservations)).toHaveLength(1);
  });

  it('keeps a pending claim from last month until it is settled or explicitly failed', async () => {
    const first = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    await db.update(meetingQuotaReservations).set({ createdAt: sql`now() - interval '1 month'` })
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    await expect(meetingsRepo.reserve(upload(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
    await meetingsRepo.updateStatus(first.id, 'failed');
    await meetingsRepo.updateStatus(first.id, 'failed');
    await expect(meetingsRepo.reserve(upload(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
    await meetingsRepo.markBotCreationRejected(first.id, 'Definite provider rejection');
    const next = await meetingsRepo.reserve(upload(ownerUserId), plan, 2);
    expect(next.source).toBe('upload');
  });

  it('atomically replaces a reservation with one ledger charge, including webhook replay', async () => {
    const first = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    expect(await usageRepo.addSeconds(first.id, 1800)).toBe(1800);
    expect(await usageRepo.addSeconds(first.id, 1800)).toBe(1800);
    expect(await usageRepo.addSeconds(first.id, null)).toBe(1800);
    const rows = await db.select().from(usageLedger).where(eq(usageLedger.meetingId, first.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].secondsRecorded).toBe(1800);
    const [reservation] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(reservation.releasedAt).not.toBeNull();
    await expect(meetingsRepo.reserve(bot(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
  });

  it('settles a silent bot to its reserved maximum when provider timing is unavailable', async () => {
    const first = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    expect(await usageRepo.addSeconds(first.id, null)).toBe(2000);
    expect(await usageRepo.addSeconds(first.id, null)).toBe(2000);
    const [charge] = await db.select().from(usageLedger)
      .where(eq(usageLedger.meetingId, first.id));
    expect(charge.secondsRecorded).toBe(2000);
    await expect(meetingsRepo.reserve(upload(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
  });

  it('keeps a created bot claim after failure until recording time is settled', async () => {
    const first = await meetingsRepo.reserve(bot(ownerUserId), plan, 2);
    await meetingsRepo.updateStatus(first.id, 'bot_joining', { botId: 'bot-1' });
    await meetingsRepo.updateStatus(first.id, 'failed');
    const [before] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(before.releasedAt).toBeNull();
    await expect(meetingsRepo.reserve(upload(ownerUserId), plan, 2))
      .rejects.toBeInstanceOf(CapExceededError);
    expect(await usageRepo.addSeconds(first.id, null)).toBe(2000);
    const [after] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(after.releasedAt).not.toBeNull();
  });

  it('admits only one AssemblyAI submission and binds its job once', async () => {
    const first = await meetingsRepo.reserve(upload(ownerUserId), plan, 2);
    await meetingsRepo.setUploadInfo(first.id, { audioStoragePath: 'audio/test.webm' });
    const results = await Promise.all([
      meetingsRepo.claimUploadSubmission(first.id),
      new DrizzleMeetingRepository().claimUploadSubmission(first.id),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(false);
    expect(await meetingsRepo.bindTranscriptionJob(first.id, 'job-1')).toBe(true);
    expect(await meetingsRepo.bindTranscriptionJob(first.id, 'job-2')).toBe(false);
    expect((await meetingsRepo.findById(first.id))?.transcriptionJobId).toBe('job-1');
  });

  it('fences a pending storage upload before provider admission and retains its object reference', async () => {
    const pending = await meetingsRepo.reserve(upload(ownerUserId, 60), plan, 2);
    const otherReplica = new DrizzleMeetingRepository();
    await new DrizzleUserRepository().beginDeletion(ownerUserId);
    expect(await otherReplica.hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(true);
    await meetingsRepo.setUploadInfo(pending.id, { audioStoragePath: 'audio/planned.webm' });
    expect(await otherReplica.claimUploadSubmission(pending.id)).toBe(false);
    expect(await otherReplica.abortUploadIfDeleting(pending.id)).toBe(true);
    expect(await otherReplica.hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(false);
    const row = await meetingsRepo.findById(pending.id);
    expect(row?.audioStoragePath).toBe('audio/planned.webm');
    expect(row?.uploadProviderExcludedAt).not.toBeNull();
  });

  it('keeps a historical failed upload without provider receipt deletion-blocking', async () => {
    const pending = await meetingsRepo.reserve(upload(ownerUserId, 60), plan, 2);
    await meetingsRepo.updateStatus(pending.id, 'failed', { errorMessage: 'Old worker timeout' });
    await new DrizzleUserRepository().beginDeletion(ownerUserId);
    expect(await new DrizzleMeetingRepository().hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(true);
    expect(await meetingsRepo.abortUploadIfDeleting(pending.id)).toBe(false);
  });

  it('retains a claimed upload after sweep failure and binds a late provider job ID', async () => {
    const pending = await meetingsRepo.reserve(upload(ownerUserId, 60), plan, 2);
    await meetingsRepo.setUploadInfo(pending.id, { audioStoragePath: 'audio/planned.webm' });
    expect(await meetingsRepo.claimUploadSubmission(pending.id)).toBe(true);
    await new DrizzleUserRepository().beginDeletion(ownerUserId);
    await meetingsRepo.updateStatus(pending.id, 'failed', { errorMessage: 'Worker sweep timeout' });
    expect(await new DrizzleMeetingRepository().hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(true);
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, pending.id));
    expect(claim.releasedAt).toBeNull();
    expect(await new DrizzleMeetingRepository().bindTranscriptionJob(pending.id, 'late-job')).toBe(true);
    expect((await meetingsRepo.findById(pending.id))?.transcriptionJobId).toBe('late-job');
    expect((await meetingsRepo.findById(pending.id))?.status).toBe('failed');
    expect(await meetingsRepo.hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(true);
  });

  it('allows a definite AssemblyAI refusal after a sweep but keeps an ambiguous failure blocked', async () => {
    const pending = await meetingsRepo.reserve(upload(ownerUserId, 60), plan, 2);
    await meetingsRepo.setUploadInfo(pending.id, { audioStoragePath: 'audio/planned.webm' });
    expect(await meetingsRepo.claimUploadSubmission(pending.id)).toBe(true);
    await new DrizzleUserRepository().beginDeletion(ownerUserId);
    await meetingsRepo.updateStatus(pending.id, 'failed', { errorMessage: 'Worker sweep timeout' });
    expect(await meetingsRepo.hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(true);
    await meetingsRepo.failRejectedUploadSubmission(pending.id, 'AssemblyAI submit rejected: 401');
    expect(await meetingsRepo.hasUnresolvedUploadClaimForUser(ownerUserId)).toBe(false);
    expect((await meetingsRepo.findById(pending.id))?.uploadProviderExcludedAt).not.toBeNull();
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, pending.id));
    expect(claim.releasedAt).not.toBeNull();
  });

  it('keeps an uncertain paid upload claim after a failed worker event', async () => {
    const first = await meetingsRepo.reserve(upload(ownerUserId), plan, 2);
    await meetingsRepo.setUploadInfo(first.id, { audioStoragePath: 'audio/test.webm' });
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(true);
    await meetingsRepo.updateStatus(first.id, 'failed');
    await meetingsRepo.updateStatus(first.id, 'failed');
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(false);
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(claim.releasedAt).toBeNull();
  });

  it('keeps a paid claim when an outbox error clears the stored audio path', async () => {
    const first = await meetingsRepo.reserve(upload(ownerUserId), plan, 2);
    await meetingsRepo.setUploadInfo(first.id, { audioStoragePath: 'audio/test.webm' });
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(true);
    await meetingsRepo.setUploadInfo(first.id, { audioStoragePath: null });
    await meetingsRepo.updateStatus(first.id, 'failed');
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(claim.releasedAt).toBeNull();
  });

  it('releases an upload rejected before any submission claim despite retained audio', async () => {
    const first = await meetingsRepo.reserve(upload(ownerUserId), plan, 2);
    await meetingsRepo.setUploadInfo(first.id, { audioStoragePath: 'audio/test.webm' });
    await meetingsRepo.updateStatus(first.id, 'failed');
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(claim.releasedAt).not.toBeNull();
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(false);
  });

  it('releases a definite provider rejection but never reclaims its failed meeting', async () => {
    const first = await meetingsRepo.reserve(upload(ownerUserId), plan, 2);
    await meetingsRepo.setUploadInfo(first.id, { audioStoragePath: 'audio/test.webm' });
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(true);
    await meetingsRepo.failRejectedUploadSubmission(first.id, 'AssemblyAI submit rejected: 401');
    const [claim] = await db.select().from(meetingQuotaReservations)
      .where(eq(meetingQuotaReservations.meetingId, first.id));
    expect(claim.releasedAt).not.toBeNull();
    expect((await meetingsRepo.findById(first.id))?.status).toBe('failed');
    expect(await meetingsRepo.claimUploadSubmission(first.id)).toBe(false);
  });
});
