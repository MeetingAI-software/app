export type Values = Record<string, string>;

export const EXPECTED_WEBHOOK_URL = 'https://api.syncmemos.com/webhooks/paddle';
export const REQUIRED_EVENTS = [
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

export const PRICE_SPECS = [
  { key: 'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID', amount: '1900', interval: 'month', product: 'Solo' },
  { key: 'NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID', amount: '18240', interval: 'year', product: 'Solo' },
  { key: 'NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID', amount: '3900', interval: 'month', product: 'Team' },
  { key: 'NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID', amount: '37440', interval: 'year', product: 'Team' },
] as const;

type PaddleEnvironment = 'sandbox' | 'production';

export interface ResolvedReadiness {
  environment: string;
  token: string | undefined;
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  billingMutationsEnabled: boolean;
  expectedTokenPrefix: string;
  expectedApiPrefix: string;
  prices: Array<(typeof PRICE_SPECS)[number] & { id: string | undefined }>;
}

export interface CatalogPriceSnapshot {
  id: string;
  productId: string;
  currencyCode: string;
  amount: string;
  interval: string | null;
  frequency: number | null;
}

export interface CatalogProductSnapshot {
  id: string;
  name: string;
  status: string;
}

export interface NotificationSnapshot {
  type: string;
  destination: string;
  subscribedEvents: string[];
  endpointSecretKey?: string | null;
}

export function isConfigured(value: string | undefined): value is string {
  return Boolean(value && !/your_|pri_(solo|team|business)/i.test(value));
}

export function resolveReadiness(api: Values, web: Values): ResolvedReadiness {
  const environment = web.NEXT_PUBLIC_PADDLE_ENV || api.PADDLE_ENV || 'sandbox';
  const paddleEnvironment = environment === 'production' ? 'production' : 'sandbox';

  return {
    environment,
    token: web.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    apiKey: api.PADDLE_API_KEY || api.PADDLE_SANDBOX_API_KEY,
    webhookSecret: api.PADDLE_NOTIFICATION_WEBHOOK_SECRET,
    billingMutationsEnabled: api.BILLING_MUTATIONS_ENABLED === 'true',
    expectedTokenPrefix: paddleEnvironment === 'production' ? 'live_' : 'test_',
    expectedApiPrefix: paddleEnvironment === 'production' ? 'pdl_live_apikey_' : 'pdl_sdbx_apikey_',
    prices: PRICE_SPECS.map((spec) => ({ ...spec, id: web[spec.key] })),
  };
}

export function validateConfiguration(api: Values, web: Values, resolved = resolveReadiness(api, web)): string[] {
  const issues: string[] = [];
  const { environment, token, apiKey, webhookSecret, prices } = resolved;

  if (environment !== 'sandbox' && environment !== 'production') {
    issues.push(`Unsupported Paddle environment: ${environment}`);
  }
  if (api.PADDLE_ENV && web.NEXT_PUBLIC_PADDLE_ENV && api.PADDLE_ENV !== web.NEXT_PUBLIC_PADDLE_ENV) {
    issues.push('API and web use different Paddle environments');
  }
  if (!isConfigured(token)) issues.push('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is missing');
  else if (!token.startsWith(resolved.expectedTokenPrefix)) issues.push(`Client token does not match ${environment}`);
  if (!isConfigured(apiKey)) issues.push('PADDLE_API_KEY is missing from apps/api/.env');
  else if (!apiKey.startsWith(resolved.expectedApiPrefix)) issues.push(`API key does not match ${environment}`);
  if (!isConfigured(webhookSecret)) issues.push('PADDLE_NOTIFICATION_WEBHOOK_SECRET is missing from apps/api/.env');
  else if (!webhookSecret.startsWith('pdl_ntfset_')) issues.push('Webhook secret has an unexpected prefix');

  for (const price of prices) {
    if (!isConfigured(price.id)) issues.push(`${price.key} is missing`);
    else if (!price.id.startsWith('pri_')) issues.push(`${price.key} is not a Paddle price ID`);

    const apiPrice = api[price.key];
    if (!isConfigured(apiPrice)) issues.push(`${price.key} is missing from the API configuration`);
    else if (isConfigured(price.id) && apiPrice !== price.id) {
      issues.push(`${price.key} differs between the API and frontend configurations`);
    }
  }

  const configuredIds = prices.flatMap((price) => isConfigured(price.id) ? [price.id] : []);
  if (new Set(configuredIds).size !== configuredIds.length) {
    issues.push('The four checkout slots must use four distinct Paddle price IDs');
  }

  for (const legacyKey of [
    'NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID',
    'NEXT_PUBLIC_PADDLE_BUSINESS_ANNUAL_PRICE_ID',
  ]) {
    if (api[legacyKey] || web[legacyKey]) issues.push(`${legacyKey} must be removed; Business is contact-only`);
  }

  return issues;
}

export function canCheckRemote(resolved: ResolvedReadiness): resolved is ResolvedReadiness & {
  environment: PaddleEnvironment;
  apiKey: string;
} {
  return isConfigured(resolved.apiKey)
    && resolved.apiKey.startsWith(resolved.expectedApiPrefix)
    && resolved.prices.every((price) => isConfigured(price.id))
    && (resolved.environment === 'sandbox' || resolved.environment === 'production');
}

export function validateCatalog(
  resolved: ResolvedReadiness,
  activePrices: CatalogPriceSnapshot[],
  products: CatalogProductSnapshot[],
  hasMore: boolean,
): string[] {
  const issues: string[] = [];
  if (hasMore || activePrices.length !== PRICE_SPECS.length) {
    issues.push(`Paddle must contain exactly ${PRICE_SPECS.length} active prices`);
  }

  const activeById = new Map(activePrices.map((price) => [price.id, price]));
  const expectedProducts = new Map<string, string>();
  for (const spec of resolved.prices) {
    const price = isConfigured(spec.id) ? activeById.get(spec.id) : undefined;
    if (!price) {
      issues.push(`${spec.key} does not reference an active price in this Paddle environment`);
      continue;
    }
    if (price.currencyCode !== 'EUR') issues.push(`${spec.key} must use EUR`);
    if (price.amount !== spec.amount) issues.push(`${spec.key} has the wrong unit amount`);
    if (price.interval !== spec.interval || price.frequency !== 1) {
      issues.push(`${spec.key} has the wrong billing cycle`);
    }
    const previousProduct = expectedProducts.get(price.productId);
    if (previousProduct && previousProduct !== spec.product) {
      issues.push('Solo and Team prices must belong to separate Paddle products');
    }
    expectedProducts.set(price.productId, spec.product);
  }

  if (expectedProducts.size !== 2) issues.push('The four prices must belong to exactly two Paddle products');
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const [productId, expectedName] of expectedProducts) {
    const product = productById.get(productId);
    if (!product || product.status !== 'active' || product.name !== expectedName) {
      issues.push(`${expectedName} prices must belong to an active product named ${expectedName}`);
    }
  }

  return issues;
}

export function validateNotifications(
  resolved: ResolvedReadiness,
  settings: NotificationSnapshot[],
): { issues: string[]; readyCount: number } {
  const requiredEvents = new Set<string>(REQUIRED_EVENTS);
  const ready = settings.filter((setting) => {
    const subscribed = new Set(setting.subscribedEvents);
    return setting.type === 'url'
      && setting.destination === EXPECTED_WEBHOOK_URL
      && [...requiredEvents].every((event) => subscribed.has(event));
  });
  const issues: string[] = [];
  if (ready.length === 0) {
    issues.push('No active Paddle webhook uses the required URL and complete customer/subscription/transaction event set');
  } else if (isConfigured(resolved.webhookSecret)
    && !ready.some((setting) => setting.endpointSecretKey === resolved.webhookSecret)) {
    issues.push('Configured webhook secret does not match any ready Paddle notification destination');
  }
  return { issues, readyCount: ready.length };
}
