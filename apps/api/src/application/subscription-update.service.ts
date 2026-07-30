import { InvalidBillingPriceError, PaddleCustomerNotFoundError } from '../domain/errors';
import type { PlanId } from '../domain/billing';
import type { PaddleBillingRepository, PaddleSubscriptionRecord } from '../ports/repositories.port';
import type {
  PaddlePlanChangePreview,
  PlanChangeProrationMode,
  SubscriptionUpdatePort,
} from '../ports/subscription-update.port';

type ChangeablePlan = Extract<PlanId, 'solo' | 'team'>;
export type BillingInterval = 'monthly' | 'annual';

export interface PlanChangePrice {
  priceId: string;
  plan: ChangeablePlan;
  interval: BillingInterval;
}

export interface SubscriptionChangePreview extends PaddlePlanChangePreview {
  targetPlan: ChangeablePlan;
  targetInterval: BillingInterval;
  prorationBillingMode: PlanChangeProrationMode;
}

const CHANGEABLE_STATUSES = new Set(['active', 'trialing']);
const PLAN_RANK: Record<ChangeablePlan, number> = { solo: 1, team: 2 };

export class SubscriptionUpdateService {
  constructor(
    private readonly billingRepo: PaddleBillingRepository,
    private readonly paddle: SubscriptionUpdatePort,
    private readonly prices: PlanChangePrice[],
  ) {}

  async previewForUser(userId: string, targetPriceId: string): Promise<SubscriptionChangePreview> {
    const change = await this.resolveChange(userId, targetPriceId);
    const preview = await this.paddle.preview(change.request);
    return {
      ...preview,
      targetPlan: change.target.plan,
      targetInterval: change.target.interval,
      prorationBillingMode: change.request.prorationBillingMode,
    };
  }

  async updateForUser(userId: string, targetPriceId: string) {
    const change = await this.resolveChange(userId, targetPriceId);
    return this.paddle.update(change.request);
  }

  private async resolveChange(userId: string, targetPriceId: string) {
    const target = this.prices.find((price) => price.priceId === targetPriceId);
    if (!target) throw new InvalidBillingPriceError('That subscription plan is not available');

    const subscriptions = await this.billingRepo.listSubscriptionsForUser(userId);
    const subscription = subscriptions.find((item) => CHANGEABLE_STATUSES.has(item.status));
    if (!subscription) throw new PaddleCustomerNotFoundError('No active subscription is available to change');
    if (subscription.scheduledChangeAction) {
      throw new InvalidBillingPriceError('Remove the scheduled subscription change before switching plans');
    }

    const current = this.priceFor(subscription);
    if (current.priceId === target.priceId) {
      throw new InvalidBillingPriceError('You are already subscribed to that plan');
    }
    if (current.interval !== target.interval) {
      throw new InvalidBillingPriceError('Choose the matching billing interval when switching plans');
    }

    const isUpgrade = PLAN_RANK[target.plan] > PLAN_RANK[current.plan];
    const prorationBillingMode: PlanChangeProrationMode = isUpgrade
      ? 'prorated_immediately'
      : 'prorated_next_billing_period';

    return {
      target,
      request: {
        subscriptionId: subscription.subscriptionId,
        priceId: target.priceId,
        quantity: target.plan === 'solo' ? 1 : Math.max(1, subscription.quantity),
        prorationBillingMode,
      },
    };
  }

  private priceFor(subscription: PaddleSubscriptionRecord): PlanChangePrice {
    const current = this.prices.find((price) => price.priceId === subscription.priceId);
    if (!current) throw new InvalidBillingPriceError('The current subscription cannot be changed in this screen');
    return current;
  }
}
