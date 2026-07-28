import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import type { PlanId } from './pricing';

type PaidPlanId = Exclude<PlanId, 'free'>;
type BillingInterval = 'monthly' | 'annual';

const priceIds: Record<PaidPlanId, Record<BillingInterval, string | undefined>> = {
  solo: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID,
    annual: process.env.NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID,
  },
  team: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID,
    annual: process.env.NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID,
  },
  business: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID,
    annual: process.env.NEXT_PUBLIC_PADDLE_BUSINESS_ANNUAL_PRICE_ID,
  },
};

let paddlePromise: Promise<Paddle | undefined> | undefined;

export function getPaddlePriceId(planId: PlanId, isAnnual: boolean): string | null {
  if (planId === 'free') return null;
  return priceIds[planId][isAnnual ? 'annual' : 'monthly'] ?? null;
}

export function getPaddle(): Promise<Paddle | undefined> {
  if (typeof window === 'undefined') return Promise.resolve(undefined);

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) return Promise.reject(new Error('Paddle client token is not configured'));

  paddlePromise ??= initializePaddle({
    token,
    environment: process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
  });

  return paddlePromise;
}
