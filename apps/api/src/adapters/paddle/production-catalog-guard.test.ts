import { describe, expect, it, vi } from 'vitest';
import { envSchema } from '../../config/env';
import { assertProductionPaddleCatalog, type PaddleCatalogReader } from './production-catalog-guard';

const config = envSchema.parse({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  WEB_ORIGIN: 'https://www.syncmemos.com',
  PADDLE_ENV: 'production',
  PADDLE_API_KEY: 'pdl_live_apikey_example',
  PADDLE_NOTIFICATION_WEBHOOK_SECRET: 'pdl_ntfset_example',
  NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID: 'pri_solo_monthly',
  NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID: 'pri_solo_annual',
  NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID: 'pri_team_monthly',
  NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID: 'pri_team_annual',
});

function readyReader(): PaddleCatalogReader {
  return {
    listActivePrices: vi.fn().mockResolvedValue([
      { id: 'pri_solo_monthly', productId: 'pro_solo', status: 'active', currencyCode: 'EUR', amount: '1900', interval: 'month', frequency: 1 },
      { id: 'pri_solo_annual', productId: 'pro_solo', status: 'active', currencyCode: 'EUR', amount: '18240', interval: 'year', frequency: 1 },
      { id: 'pri_team_monthly', productId: 'pro_team', status: 'active', currencyCode: 'EUR', amount: '3900', interval: 'month', frequency: 1 },
      { id: 'pri_team_annual', productId: 'pro_team', status: 'active', currencyCode: 'EUR', amount: '37440', interval: 'year', frequency: 1 },
    ]),
    getProduct: vi.fn(async id => ({ id, name: id === 'pro_solo' ? 'Solo' : 'Team', status: 'active' })),
  };
}

describe('production Paddle catalog guard', () => {
  it('accepts the exact Live catalog', async () => {
    await expect(assertProductionPaddleCatalog(config, readyReader())).resolves.toBeUndefined();
  });

  it('fails closed when a configured price has the wrong amount', async () => {
    const reader = readyReader();
    const prices = await reader.listActivePrices();
    prices[0] = { ...prices[0], amount: '2000' };
    reader.listActivePrices = vi.fn().mockResolvedValue(prices);
    await expect(assertProductionPaddleCatalog(config, reader)).rejects.toThrow(
      'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID has the wrong amount',
    );
  });

  it('fails closed when an extra active price exists', async () => {
    const reader = readyReader();
    const prices = await reader.listActivePrices();
    reader.listActivePrices = vi.fn().mockResolvedValue([
      ...prices,
      { id: 'pri_extra', productId: 'pro_extra', status: 'active', currencyCode: 'EUR', amount: '100', interval: 'month', frequency: 1 },
    ]);
    await expect(assertProductionPaddleCatalog(config, reader)).rejects.toThrow(
      'expected exactly 4 active prices, found 5',
    );
  });

  it('does not call Paddle outside a production Live deployment', async () => {
    const reader = readyReader();
    await assertProductionPaddleCatalog({ ...config, NODE_ENV: 'test' }, reader);
    expect(reader.listActivePrices).not.toHaveBeenCalled();
  });
});
