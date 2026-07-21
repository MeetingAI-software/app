import type { MeetingRepository, UsageRepository } from '../ports/repositories.port';
import { CapExceededError } from '../domain/errors';
import { config } from '../config/env';

export class UsageMeterService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly usageRepo: UsageRepository
  ) {}

  async assertCanStartMeeting(userId: string): Promise<void> {
    // 1. Check concurrent bot limit (per user)
    const activeBots = await this.meetingRepo.countActiveForUser(userId);
    if (activeBots >= config.MAX_CONCURRENT_BOTS) {
      throw new CapExceededError('concurrent bot limit');
    }

    // 2. Check monthly usage cap (per user). Reserve worst-case max meeting duration
    const monthlySeconds = await this.usageRepo.monthlyTotalSeconds(userId);
    if (monthlySeconds + config.MAX_MEETING_SECONDS > config.MONTHLY_CAP_SECONDS) {
      throw new CapExceededError('monthly cap');
    }
  }

  async recordUsage(meetingId: string, seconds: number): Promise<void> {
    await this.usageRepo.addSeconds(meetingId, seconds);
  }
}
