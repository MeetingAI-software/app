import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageMeterService } from './usage-meter.service';
import { CapExceededError, PlanUpgradeRequiredError } from '../domain/errors';
import type { MeetingRepository, UsageRepository } from '../ports/repositories.port';
import { PLAN_ENTITLEMENTS } from '../domain/billing';

describe('UsageMeterService', () => {
  let mockMeetingRepo: MeetingRepository;
  let mockUsageRepo: UsageRepository;
  let usageMeterService: UsageMeterService;

  beforeEach(() => {
    mockMeetingRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByBotId: vi.fn(),
      findByShareToken: vi.fn(),
      findByTranscriptionJobId: vi.fn(),
      updateStatus: vi.fn(),
      setSummary: vi.fn(),
      setUploadInfo: vi.fn(),
      countActive: vi.fn(),
      countActiveForUser: vi.fn(),
      list: vi.fn(),
      findByIdForUser: vi.fn(),
      listForUser: vi.fn(),
      deleteById: vi.fn(),
    };


    mockUsageRepo = {
      addSeconds: vi.fn(),
      monthlyTotalSeconds: vi.fn(),
      deleteByMeeting: vi.fn(),
    };

    usageMeterService = new UsageMeterService(mockMeetingRepo, mockUsageRepo, {
      getAccess: vi.fn().mockResolvedValue({
        plan: 'solo', status: 'active', hasPaidAccess: true,
        entitlements: PLAN_ENTITLEMENTS.solo, subscription: null,
      }),
    });
  });

  it('allows meeting if limits are not reached', async () => {
    vi.mocked(mockMeetingRepo.countActiveForUser).mockResolvedValue(0);
    vi.mocked(mockUsageRepo.monthlyTotalSeconds).mockResolvedValue(1000);

    await expect(usageMeterService.assertCanStartMeeting('user-1')).resolves.not.toThrow();
  });

  it('throws CapExceededError if concurrency limit is reached', async () => {
    vi.mocked(mockMeetingRepo.countActiveForUser).mockResolvedValue(1); // config.MAX_CONCURRENT_BOTS is 1
    vi.mocked(mockUsageRepo.monthlyTotalSeconds).mockResolvedValue(1000);

    await expect(usageMeterService.assertCanStartMeeting('user-1')).rejects.toThrow(
      new CapExceededError('concurrent bot limit')
    );
  });

  it('throws CapExceededError if monthly cap would be exceeded by a max duration meeting', async () => {
    vi.mocked(mockMeetingRepo.countActiveForUser).mockResolvedValue(0);
    // Solo: 36,000 seconds/month and 3,600 seconds max per meeting.
    vi.mocked(mockUsageRepo.monthlyTotalSeconds).mockResolvedValue(33_000);

    await expect(usageMeterService.assertCanStartMeeting('user-1')).rejects.toThrow(
      new CapExceededError('Monthly recording limit reached for your plan')
    );
  });

  it('records usage by delegating to repo', async () => {
    await usageMeterService.recordUsage('meeting-123', 600);
    expect(mockUsageRepo.addSeconds).toHaveBeenCalledWith('meeting-123', 600);
  });

  it('blocks in-room uploads when the plan does not include them', async () => {
    const freeMeter = new UsageMeterService(mockMeetingRepo, mockUsageRepo, {
      getAccess: vi.fn().mockResolvedValue({
        plan: 'free', status: 'none', hasPaidAccess: false,
        entitlements: PLAN_ENTITLEMENTS.free, subscription: null,
      }),
    });

    await expect(freeMeter.assertCanStartMeeting('user-1', 'upload')).rejects.toThrow(
      PlanUpgradeRequiredError,
    );
    expect(mockMeetingRepo.countActiveForUser).not.toHaveBeenCalled();
  });
});
