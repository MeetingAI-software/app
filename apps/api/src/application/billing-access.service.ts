import type { PaddleBillingRepository, PaddleSubscriptionRecord } from '../ports/repositories.port';
import {
  PLAN_ENTITLEMENTS,
  type BillingAccess,
  type BillingAccessProvider,
  type PlanEntitlements,
  type PlanId,
} from '../domain/billing';

export interface PaddlePriceCatalog {
  solo: string[];
  team: string[];
  business: string[];
}

const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

export class BillingAccessService implements BillingAccessProvider {
  constructor(
    private readonly billingRepo: PaddleBillingRepository,
    private readonly prices: PaddlePriceCatalog,
  ) {}

  async getAccess(userId: string): Promise<BillingAccess> {
    const subscriptions = await this.billingRepo.listSubscriptionsForUser(userId);
    const subscription = subscriptions.find((item) => ACCESS_STATUSES.has(item.status))
      ?? subscriptions[0]
      ?? null;

    if (!subscription) return this.freeAccess();

    const plan = this.planForPrice(subscription.priceId);
    const hasPaidAccess = plan !== 'free' && ACCESS_STATUSES.has(subscription.status);
    const effectivePlan: PlanId = hasPaidAccess ? plan : 'free';
    const entitlements = this.withSeatQuantity(PLAN_ENTITLEMENTS[effectivePlan], effectivePlan, subscription.quantity);

    return {
      plan: effectivePlan,
      status: subscription.status,
      hasPaidAccess,
      entitlements,
      subscription: this.toSummary(subscription),
    };
  }

  private planForPrice(priceId: string | null): PlanId {
    if (!priceId) return 'free';
    if (this.prices.solo.includes(priceId)) return 'solo';
    if (this.prices.team.includes(priceId)) return 'team';
    if (this.prices.business.includes(priceId)) return 'business';
    return 'free';
  }

  private withSeatQuantity(entitlements: PlanEntitlements, plan: PlanId, quantity: number): PlanEntitlements {
    if (plan !== 'team' && plan !== 'business') return entitlements;
    return { ...entitlements, monthlySecondsCap: entitlements.monthlySecondsCap * Math.max(1, quantity) };
  }

  private freeAccess(): BillingAccess {
    return {
      plan: 'free',
      status: 'none',
      hasPaidAccess: false,
      entitlements: PLAN_ENTITLEMENTS.free,
      subscription: null,
    };
  }

  private toSummary(subscription: PaddleSubscriptionRecord): NonNullable<BillingAccess['subscription']> {
    return {
      id: subscription.subscriptionId,
      quantity: subscription.quantity,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      scheduledChangeAction: subscription.scheduledChangeAction,
      scheduledChangeAt: subscription.scheduledChangeAt?.toISOString() ?? null,
    };
  }
}
