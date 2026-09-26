import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { meetingQuotaReservations, meetings, usageLedger, users } from '../schema';
import { DrizzleMeetingRepository } from './meeting.repository';
import { DrizzleUsageRepository } from './usage.repository';
import { CapExceededError } from '../../../domain/errors';
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
  const upload = (ownerUserId: string) => ({ ownerUserId, source: 'upload' as const });

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
});
