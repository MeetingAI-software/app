import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageMeterService } from './usage-meter.service';
import { CapExceededError, FeatureUnavailableError, PlanUpgradeRequiredError } from '../domain/errors';
import type { MeetingRepository, UsageRepository } from '../ports/repositories.port';
import { PLAN_ENTITLEMENTS } from '../domain/billing';
import { config } from '../config/env';

describe('UsageMeterService', () => {
  const reserve = vi.fn();
  const addSeconds = vi.fn();
  const getAccess = vi.fn();
  const meetingRepo = { reserve } as unknown as MeetingRepository;
  const usageRepo = { addSeconds } as unknown as UsageRepository;

  beforeEach(() => {
    reserve.mockReset().mockResolvedValue({ id: 'meeting-1' });
    addSeconds.mockReset();
    getAccess.mockReset().mockResolvedValue({ entitlements: PLAN_ENTITLEMENTS.team });
  });

  it('passes the authenticated owner, cap and meeting inputs to one atomic repository call', async () => {
    const meter = new UsageMeterService(meetingRepo, usageRepo, { getAccess }, true);
    const result = await meter.reserveMeeting('user-1', 'bot', { meetingUrl: 'https://zoom.us/j/1' });
    expect(reserve).toHaveBeenCalledWith(
      { ownerUserId: 'user-1', source: 'bot', meetingUrl: 'https://zoom.us/j/1' },
      PLAN_ENTITLEMENTS.team, config.MAX_CONCURRENT_BOTS,
    );
    expect(result.meeting).toEqual({ id: 'meeting-1' });
  });

  it('propagates a quota rejection without granting a meeting', async () => {
    reserve.mockRejectedValue(new CapExceededError('concurrent recording limit'));
    const meter = new UsageMeterService(meetingRepo, usageRepo, { getAccess }, true);
    await expect(meter.reserveMeeting('user-1', 'bot', {})).rejects.toBeInstanceOf(CapExceededError);
  });

  it('rejects disabled uploads before a database claim', async () => {
    const meter = new UsageMeterService(meetingRepo, usageRepo, { getAccess });
    await expect(meter.reserveMeeting('user-1', 'upload', {}))
      .rejects.toBeInstanceOf(FeatureUnavailableError);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('rejects uploads outside the plan before a database claim', async () => {
    getAccess.mockResolvedValue({ entitlements: PLAN_ENTITLEMENTS.free });
    const meter = new UsageMeterService(meetingRepo, usageRepo, { getAccess }, true);
    await expect(meter.reserveMeeting('user-1', 'upload', {}))
      .rejects.toBeInstanceOf(PlanUpgradeRequiredError);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('settles usage through the idempotent repository', async () => {
    const meter = new UsageMeterService(meetingRepo, usageRepo, { getAccess }, true);
    await meter.recordUsage('meeting-1', 600);
    expect(addSeconds).toHaveBeenCalledWith('meeting-1', 600);
  });
});
