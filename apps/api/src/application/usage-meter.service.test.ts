import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageMeterService } from './usage-meter.service';
import { CapExceededError } from '../domain/errors';
import type { MeetingRepository, UsageRepository } from '../ports/repositories.port';

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
      updateStatus: vi.fn(),
      setSummary: vi.fn(),
      countActive: vi.fn(),
      list: vi.fn(),
    };


    mockUsageRepo = {
      addSeconds: vi.fn(),
      monthlyTotalSeconds: vi.fn(),
    };

    usageMeterService = new UsageMeterService(mockMeetingRepo, mockUsageRepo);
  });

  it('allows meeting if limits are not reached', async () => {
    vi.mocked(mockMeetingRepo.countActive).mockResolvedValue(0);
    vi.mocked(mockUsageRepo.monthlyTotalSeconds).mockResolvedValue(1000);

    await expect(usageMeterService.assertCanStartMeeting()).resolves.not.toThrow();
  });

  it('throws CapExceededError if concurrency limit is reached', async () => {
    vi.mocked(mockMeetingRepo.countActive).mockResolvedValue(1); // config.MAX_CONCURRENT_BOTS is 1
    vi.mocked(mockUsageRepo.monthlyTotalSeconds).mockResolvedValue(1000);

    await expect(usageMeterService.assertCanStartMeeting()).rejects.toThrow(
      new CapExceededError('concurrent bot limit')
    );
  });

  it('throws CapExceededError if monthly cap would be exceeded by a max duration meeting', async () => {
    vi.mocked(mockMeetingRepo.countActive).mockResolvedValue(0);
    // MONTHLY_CAP_SECONDS=14400, MAX_MEETING_SECONDS=3600
    // 11000 + 3600 = 14600 > 14400
    vi.mocked(mockUsageRepo.monthlyTotalSeconds).mockResolvedValue(11000);

    await expect(usageMeterService.assertCanStartMeeting()).rejects.toThrow(
      new CapExceededError('monthly cap')
    );
  });

  it('records usage by delegating to repo', async () => {
    await usageMeterService.recordUsage('meeting-123', 600);
    expect(mockUsageRepo.addSeconds).toHaveBeenCalledWith('meeting-123', 600);
  });
});
