import { config } from './env';
import type { PaddlePriceCatalog } from '../application/billing-access.service';
import type { PlanChangePrice } from '../application/subscription-update.service';

function configured(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

export const paddlePriceCatalog: PaddlePriceCatalog = {
  solo: configured([
    config.NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID,
    config.NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID,
  ]),
  team: configured([
    config.NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID,
    config.NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID,
  ]),
  business: [],
};

export const paddleCheckoutPriceIds = new Set([
  ...paddlePriceCatalog.solo,
  ...paddlePriceCatalog.team,
]);

export const paddleTeamPriceIds = new Set(paddlePriceCatalog.team);

export const paddlePlanChangePrices: PlanChangePrice[] = [
  { priceId: config.NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID, plan: 'solo', interval: 'monthly' },
  { priceId: config.NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID, plan: 'solo', interval: 'annual' },
  { priceId: config.NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID, plan: 'team', interval: 'monthly' },
  { priceId: config.NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID, plan: 'team', interval: 'annual' },
].filter((price): price is PlanChangePrice => Boolean(price.priceId));
