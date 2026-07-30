import { config } from './env';
import type { PaddlePriceCatalog } from '../application/billing-access.service';

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
  business: configured([
    config.NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID,
    config.NEXT_PUBLIC_PADDLE_BUSINESS_ANNUAL_PRICE_ID,
  ]),
};
