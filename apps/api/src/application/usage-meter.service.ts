import type { MeetingRepository, UsageRepository } from '../ports/repositories.port';
import { FeatureUnavailableError, PlanUpgradeRequiredError } from '../domain/errors';
import type { BillingAccessProvider } from '../domain/billing';
import { config } from '../config/env';
import type { MeetingPlatform, MeetingSource } from '../domain/types';

export class UsageMeterService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly usageRepo: UsageRepository,
    private readonly billingAccess: BillingAccessProvider,
    private readonly inRoomRecordingEnabled = false,
  ) {}

  async reserveMeeting(userId: string, source: MeetingSource, input: {
    meetingUrl?: string; platform?: MeetingPlatform; participantNames?: string[];
    recordingNoticeConfirmedAt?: Date; recordingNoticeVersion?: string;
  }) {
    const access = await this.billingAccess.getAccess(userId);
    if (source === 'upload' && !this.inRoomRecordingEnabled) {
      throw new FeatureUnavailableError('In-room recording is not available in this environment');
    }
    if (source === 'upload' && !access.entitlements.phoneInRoomRecording) {
      throw new PlanUpgradeRequiredError('In-room recording requires a Team or Business plan');
    }
    const meeting = await this.meetingRepo.reserve(
      { ownerUserId: userId, source, ...input }, access.entitlements, config.MAX_CONCURRENT_BOTS,
    );
    return { meeting, entitlements: access.entitlements };
  }

  async recordUsage(meetingId: string, seconds: number): Promise<void> {
    await this.usageRepo.addSeconds(meetingId, seconds);
  }
}
