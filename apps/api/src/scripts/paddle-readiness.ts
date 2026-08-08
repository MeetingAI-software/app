import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';

type Values = Record<string, string>;

const EXPECTED_WEBHOOK_URL = 'https://api.syncmemos.com/webhooks/paddle';
const REQUIRED_EVENTS = [
  'customer.created',
  'customer.updated',
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.canceled',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'subscription.trialing',
  'transaction.completed',
  'transaction.payment_failed',
] as const;

const PRICE_SPECS = [
  { key: 'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID', amount: '1900', interval: 'month', product: 'Solo' },
  { key: 'NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID', amount: '18240', interval: 'year', product: 'Solo' },
  { key: 'NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID', amount: '3900', interval: 'month', product: 'Team' },
  { key: 'NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID', amount: '37440', interval: 'year', product: 'Team' },
] as const;

const repoRoot = path.resolve(__dirname, '../../../..');

function readEnv(relativePath: string): Values {
  const fullPath = path.join(repoRoot, relativePath);
  return fs.existsSync(fullPath) ? dotenv.parse(fs.readFileSync(fullPath)) : {};
}

function configured(value: string | undefined): value is string {
  return Boolean(value && !/your_|pri_(solo|team|business)/i.test(value));
}

function safeFailure(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown error';
  const candidate = error as { name?: unknown; statusCode?: unknown; status?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : 'request error';
  const status = typeof candidate.statusCode === 'number'
    ? candidate.statusCode
    : typeof candidate.status === 'number' ? candidate.status : null;
  return status === null ? name : `${name} (HTTP ${status})`;
}

async function main(): Promise<void> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const api = { ...inherited, ...readEnv('.env'), ...readEnv('apps/api/.env'), ...readEnv('apps/api/.env.local') };
  const web = { ...inherited, ...readEnv('apps/web/.env'), ...readEnv('apps/web/.env.local') };
  const issues: string[] = [];
  const environment = web.NEXT_PUBLIC_PADDLE_ENV || api.PADDLE_ENV || 'sandbox';

  if (environment !== 'sandbox' && environment !== 'production') {
    issues.push(`Unsupported Paddle environment: ${environment}`);
  }
  if (api.PADDLE_ENV && web.NEXT_PUBLIC_PADDLE_ENV && api.PADDLE_ENV !== web.NEXT_PUBLIC_PADDLE_ENV) {
    issues.push('API and web use different Paddle environments');
  }

  const token = web.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const apiKey = api.PADDLE_API_KEY || api.PADDLE_SANDBOX_API_KEY;
  const webhookSecret = api.PADDLE_NOTIFICATION_WEBHOOK_SECRET;
  const expectedTokenPrefix = environment === 'production' ? 'live_' : 'test_';
  const expectedApiPrefix = environment === 'production' ? 'pdl_live_apikey_' : 'pdl_sdbx_apikey_';

  if (!configured(token)) issues.push('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is missing');
  else if (!token.startsWith(expectedTokenPrefix)) issues.push(`Client token does not match ${environment}`);
  if (!configured(apiKey)) issues.push('PADDLE_API_KEY is missing from apps/api/.env');
  else if (!apiKey.startsWith(expectedApiPrefix)) issues.push(`API key does not match ${environment}`);
  if (!configured(webhookSecret)) issues.push('PADDLE_NOTIFICATION_WEBHOOK_SECRET is missing from apps/api/.env');
  else if (!webhookSecret.startsWith('pdl_ntfset_')) issues.push('Webhook secret has an unexpected prefix');

  const prices = PRICE_SPECS.map((spec) => ({ ...spec, id: web[spec.key] }));
  for (const price of prices) {
    if (!configured(price.id)) issues.push(`${price.key} is missing`);
    else if (!price.id.startsWith('pri_')) issues.push(`${price.key} is not a Paddle price ID`);

    const apiPrice = api[price.key];
    if (!configured(apiPrice)) issues.push(`${price.key} is missing from the API configuration`);
    else if (configured(price.id) && apiPrice !== price.id) {
      issues.push(`${price.key} differs between the API and frontend configurations`);
    }
  }

  const configuredIds = prices.flatMap((price) => configured(price.id) ? [price.id] : []);
  if (new Set(configuredIds).size !== configuredIds.length) {
    issues.push('The four checkout slots must use four distinct Paddle price IDs');
  }

  for (const legacyKey of [
    'NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID',
    'NEXT_PUBLIC_PADDLE_BUSINESS_ANNUAL_PRICE_ID',
  ]) {
    if (api[legacyKey] || web[legacyKey]) issues.push(`${legacyKey} must be removed; Business is contact-only`);
  }

  console.log(`Paddle environment: ${environment}`);
  console.log(`Frontend checkout: ${configured(token) && prices.every((price) => configured(price.id)) ? 'configured' : 'incomplete'}`);
  console.log(`Webhook backend: ${configured(apiKey) && configured(webhookSecret) ? 'configured' : 'incomplete'}`);
  console.log(`Billing mutations: ${api.BILLING_MUTATIONS_ENABLED === 'true' ? 'ENABLED (controlled test window)' : 'disabled'}`);

  const canCheckCatalog = configured(apiKey)
    && apiKey.startsWith(expectedApiPrefix)
    && prices.every((price) => configured(price.id))
    && (environment === 'sandbox' || environment === 'production');
  if (canCheckCatalog) {
    const paddle = new Paddle(apiKey, {
      environment: environment === 'production' ? Environment.production : Environment.sandbox,
    });
    let catalogValid = true;
    try {
      const activeCollection = paddle.prices.list({ status: ['active'], perPage: 200 });
      const activePrices = await activeCollection.next();
      if (activeCollection.hasMore || activePrices.length !== PRICE_SPECS.length) {
        catalogValid = false;
        issues.push(`Paddle must contain exactly ${PRICE_SPECS.length} active prices`);
      }

      const activeById = new Map(activePrices.map((price) => [price.id, price]));
      const products = new Map<string, { expectedName: string }>();
      for (const spec of prices) {
        const price = configured(spec.id) ? activeById.get(spec.id) : undefined;
        if (!price) {
          catalogValid = false;
          issues.push(`${spec.key} does not reference an active price in this Paddle environment`);
          continue;
        }
        if (price.unitPrice.currencyCode !== 'EUR') {
          catalogValid = false;
          issues.push(`${spec.key} must use EUR`);
        }
        if (price.unitPrice.amount !== spec.amount) {
          catalogValid = false;
          issues.push(`${spec.key} has the wrong unit amount`);
        }
        if (price.billingCycle?.interval !== spec.interval || price.billingCycle.frequency !== 1) {
          catalogValid = false;
          issues.push(`${spec.key} has the wrong billing cycle`);
        }
        const previousProduct = products.get(price.productId);
        if (previousProduct && previousProduct.expectedName !== spec.product) {
          catalogValid = false;
          issues.push('Solo and Team prices must belong to separate Paddle products');
        }
        products.set(price.productId, { expectedName: spec.product });
      }

      if (products.size !== 2) {
        catalogValid = false;
        issues.push('The four prices must belong to exactly two Paddle products');
      }
      for (const [productId, expected] of products) {
        const product = await paddle.products.get(productId);
        if (product.status !== 'active' || product.name !== expected.expectedName) {
          catalogValid = false;
          issues.push(`${expected.expectedName} prices must belong to an active product named ${expected.expectedName}`);
        }
      }
    } catch (error) {
      catalogValid = false;
      issues.push(`Catalog verification request failed: ${safeFailure(error)}`);
    }
    if (catalogValid) console.log('Paddle catalog: exactly 2 products and 4 active EUR prices verified');

    try {
      const settings = await paddle.notificationSettings.list({ active: true, perPage: 200 });
      const requiredEvents = new Set<string>(REQUIRED_EVENTS);
      const readyDestinations = settings.filter((setting) => {
        const subscribed = new Set<string>(setting.subscribedEvents.map((event) => event.name));
        return setting.type === 'url'
          && setting.destination === EXPECTED_WEBHOOK_URL
          && [...requiredEvents].every((event) => subscribed.has(event));
      });
      console.log(`Paddle notifications: ${settings.length} active, ${readyDestinations.length} subscribed to required events`);
      if (readyDestinations.length === 0) {
        issues.push('No active Paddle webhook uses the required URL and complete customer/subscription/transaction event set');
      } else if (configured(webhookSecret)
        && !readyDestinations.some((setting) => setting.endpointSecretKey === webhookSecret)) {
        issues.push('Configured webhook secret does not match any ready Paddle notification destination');
      }
    } catch (error) {
      issues.push(`Notification verification request failed: ${safeFailure(error)}`);
    }
  }

  if (issues.length > 0) {
    console.error('\nReadiness check failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log('Paddle configuration and all checkout prices are valid.');
}

void main();
