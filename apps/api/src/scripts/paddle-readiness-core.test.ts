import { describe, expect, it } from 'vitest';
import {
  EXPECTED_WEBHOOK_URL,
  PRICE_SPECS,
  REQUIRED_EVENTS,
  resolveReadiness,
  validateCatalog,
  validateConfiguration,
  validateNotifications,
  type CatalogPriceSnapshot,
  type CatalogProductSnapshot,
  type Values,
} from './paddle-readiness-core';

const ids = {
  NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID: 'pri_01alpha',
  NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID: 'pri_01bravo',
  NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID: 'pri_01charlie',
  NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID: 'pri_01delta',
};

function readyValues(): { api: Values; web: Values } {
  return {
    api: {
      PADDLE_ENV: 'sandbox',
      PADDLE_API_KEY: 'pdl_sdbx_apikey_secret-value',
      PADDLE_NOTIFICATION_WEBHOOK_SECRET: 'pdl_ntfset_secret-value',
      BILLING_MUTATIONS_ENABLED: 'false',
      ...ids,
    },
    web: {
      NEXT_PUBLIC_PADDLE_ENV: 'sandbox',
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_client-token',
      ...ids,
    },
  };
}

function readyCatalog(): { prices: CatalogPriceSnapshot[]; products: CatalogProductSnapshot[] } {
  return {
    prices: PRICE_SPECS.map((spec) => ({
      id: ids[spec.key],
      productId: spec.product === 'Solo' ? 'pro_solo' : 'pro_team',
      currencyCode: 'EUR',
      amount: spec.amount,
      interval: spec.interval,
      frequency: 1,
    })),
    products: [
      { id: 'pro_solo', name: 'Solo', status: 'active' },
      { id: 'pro_team', name: 'Team', status: 'active' },
    ],
  };
}

describe('Paddle readiness configuration', () => {
  it('accepts a complete fail-closed sandbox configuration', () => {
    const { api, web } = readyValues();
    const resolved = resolveReadiness(api, web);

    expect(validateConfiguration(api, web, resolved)).toEqual([]);
    expect(resolved.billingMutationsEnabled).toBe(false);
  });

  it('requires matching environments, credential prefixes, and four distinct price ids', () => {
    const { api, web } = readyValues();
    web.NEXT_PUBLIC_PADDLE_ENV = 'production';
    web.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_wrong-environment';
    web.NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID = web.NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID;

    const issues = validateConfiguration(api, web);

    expect(issues).toEqual(expect.arrayContaining([
      'API and web use different Paddle environments',
      'Client token does not match production',
      'API key does not match production',
      'The four checkout slots must use four distinct Paddle price IDs',
    ]));
  });

  it('rejects placeholder, mismatched, and legacy Business price configuration', () => {
    const { api, web } = readyValues();
    web.NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID = 'pri_solo_monthly';
    api.NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID = 'pri_different';
    api.NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID = 'pri_business';

    expect(validateConfiguration(api, web)).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID is missing',
      'NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID differs between the API and frontend configurations',
      'NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID must be removed; Business is contact-only',
    ]));
  });

  it('never includes credential values in validation failures', () => {
    const { api, web } = readyValues();
    api.PADDLE_API_KEY = 'private-api-credential';
    api.PADDLE_NOTIFICATION_WEBHOOK_SECRET = 'private-webhook-credential';
    web.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'private-client-credential';

    const output = validateConfiguration(api, web).join('\n');

    expect(output).not.toContain('private-api-credential');
    expect(output).not.toContain('private-webhook-credential');
    expect(output).not.toContain('private-client-credential');
  });
});

describe('Paddle readiness catalog', () => {
  it('accepts the exact two-product, four-price EUR catalog', () => {
    const { api, web } = readyValues();
    const { prices, products } = readyCatalog();

    expect(validateCatalog(resolveReadiness(api, web), prices, products, false)).toEqual([]);
  });

  it('reports wrong currency, amount, interval, product status, and extra active prices', () => {
    const { api, web } = readyValues();
    const { prices, products } = readyCatalog();
    prices[0] = { ...prices[0], currencyCode: 'USD', amount: '2000', interval: 'year' };
    products[0] = { ...products[0], status: 'archived' };
    prices.push({ ...prices[0], id: 'pri_unexpected' });

    const issues = validateCatalog(resolveReadiness(api, web), prices, products, false);

    expect(issues).toEqual(expect.arrayContaining([
      'Paddle must contain exactly 4 active prices',
      'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID must use EUR',
      'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID has the wrong unit amount',
      'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID has the wrong billing cycle',
      'Solo prices must belong to an active product named Solo',
    ]));
  });

  it('rejects missing prices and products shared between Solo and Team', () => {
    const { api, web } = readyValues();
    const { prices, products } = readyCatalog();
    prices.pop();
    prices[2] = { ...prices[2], productId: 'pro_solo' };

    expect(validateCatalog(resolveReadiness(api, web), prices, products, false)).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID does not reference an active price in this Paddle environment',
      'Solo and Team prices must belong to separate Paddle products',
      'The four prices must belong to exactly two Paddle products',
    ]));
  });
});

describe('Paddle readiness notifications', () => {
  it('accepts the exact endpoint, event set, and matching destination secret', () => {
    const { api, web } = readyValues();
    const result = validateNotifications(resolveReadiness(api, web), [{
      type: 'url',
      destination: EXPECTED_WEBHOOK_URL,
      subscribedEvents: [...REQUIRED_EVENTS],
      endpointSecretKey: api.PADDLE_NOTIFICATION_WEBHOOK_SECRET,
    }]);

    expect(result).toEqual({ issues: [], readyCount: 1 });
  });

  it('rejects an incomplete event set and a mismatched destination secret without leaking either secret', () => {
    const { api, web } = readyValues();
    const resolved = resolveReadiness(api, web);
    const incomplete = validateNotifications(resolved, [{
      type: 'url', destination: EXPECTED_WEBHOOK_URL,
      subscribedEvents: REQUIRED_EVENTS.slice(0, -1),
      endpointSecretKey: 'pdl_ntfset_other-secret',
    }]);
    const mismatch = validateNotifications(resolved, [{
      type: 'url', destination: EXPECTED_WEBHOOK_URL,
      subscribedEvents: [...REQUIRED_EVENTS],
      endpointSecretKey: 'pdl_ntfset_other-secret',
    }]);
    const output = [...incomplete.issues, ...mismatch.issues].join('\n');

    expect(incomplete.readyCount).toBe(0);
    expect(mismatch.issues).toContain('Configured webhook secret does not match any ready Paddle notification destination');
    expect(output).not.toContain('secret-value');
    expect(output).not.toContain('other-secret');
  });
});
