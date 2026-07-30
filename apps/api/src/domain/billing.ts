export type PlanId = 'free' | 'solo' | 'team' | 'business';

export interface PlanEntitlements {
  monthlySecondsCap: number;
  maxMeetingSeconds: number;
  chatQuestionsPerMeeting: number;
  phoneInRoomRecording: boolean;
  adminControlsAndAuditLog: boolean;
}

export interface BillingAccess {
  plan: PlanId;
  status: string | 'none';
  hasPaidAccess: boolean;
  entitlements: PlanEntitlements;
  subscription: {
    id: string;
    quantity: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    scheduledChangeAction: string | null;
    scheduledChangeAt: string | null;
  } | null;
}

export interface BillingAccessProvider {
  getAccess(userId: string): Promise<BillingAccess>;
}

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    monthlySecondsCap: 2 * 60 * 60,
    maxMeetingSeconds: 30 * 60,
    chatQuestionsPerMeeting: 10,
    phoneInRoomRecording: false,
    adminControlsAndAuditLog: false,
  },
  solo: {
    monthlySecondsCap: 10 * 60 * 60,
    maxMeetingSeconds: 60 * 60,
    chatQuestionsPerMeeting: 100,
    phoneInRoomRecording: false,
    adminControlsAndAuditLog: false,
  },
  team: {
    monthlySecondsCap: 20 * 60 * 60,
    maxMeetingSeconds: 2 * 60 * 60,
    chatQuestionsPerMeeting: 200,
    phoneInRoomRecording: true,
    adminControlsAndAuditLog: false,
  },
  business: {
    monthlySecondsCap: 40 * 60 * 60,
    // A finite operational guard remains even though the marketed plan says "Unlimited".
    maxMeetingSeconds: 24 * 60 * 60,
    chatQuestionsPerMeeting: 500,
    phoneInRoomRecording: true,
    adminControlsAndAuditLog: true,
  },
};
