import type { MeetingRepository, UsageRepository } from '../ports/repositories.port';
import { CapExceededError, PlanUpgradeRequiredError } from '../domain/errors';
import type { BillingAccessProvider, PlanEntitlements } from '../domain/billing';
import { config } from '../config/env';

export class UsageMeterService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly usageRepo: UsageRepository,
    private readonly billingAccess: BillingAccessProvider,
  ) {}

  async assertCanStartMeeting(userId: string, source: 'bot' | 'upload' = 'bot'): Promise<PlanEntitlements> {
    const access = await this.billingAccess.getAccess(userId);
    if (source === 'upload' && !access.entitlements.phoneInRoomRecording) {
      throw new PlanUpgradeRequiredError('In-room recording requires a Team or Business plan');
    }

    // 1. Check concurrent bot limit (per user)
    const activeBots = await this.meetingRepo.countActiveForUser(userId);
    if (activeBots >= config.MAX_CONCURRENT_BOTS) {
      throw new CapExceededError('concurrent bot limit');
    }

    // 2. Check monthly usage cap (per user). Reserve worst-case max meeting duration
    const monthlySeconds = await this.usageRepo.monthlyTotalSeconds(userId);
    if (monthlySeconds + access.entitlements.maxMeetingSeconds > access.entitlements.monthlySecondsCap) {
      throw new CapExceededError('Monthly recording limit reached for your plan');
    }
    return access.entitlements;
  }

  async recordUsage(meetingId: string, seconds: number): Promise<void> {
    await this.usageRepo.addSeconds(meetingId, seconds);
  }
}
