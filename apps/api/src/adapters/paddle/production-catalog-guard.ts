import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import type { Config } from '../../config/env';

interface CatalogPrice {
  id: string;
  productId: string;
  status: string;
  currencyCode: string;
  amount: string;
  interval: string | null;
  frequency: number | null;
}

interface CatalogProduct {
  id: string;
  name: string;
  status: string;
}

export interface PaddleCatalogReader {
  listActivePrices(): Promise<CatalogPrice[]>;
  getProduct(id: string): Promise<CatalogProduct>;
}

interface ExpectedPrice {
  key: keyof Pick<Config,
    | 'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID'
    | 'NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID'
    | 'NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID'
    | 'NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID'>;
  id: string;
  productName: 'Solo' | 'Team';
  amount: string;
  interval: 'month' | 'year';
}

function expectedPrices(config: Config): ExpectedPrice[] {
  return [
    { key: 'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID', id: config.NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID!, productName: 'Solo', amount: '1900', interval: 'month' },
    { key: 'NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID', id: config.NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID!, productName: 'Solo', amount: '18240', interval: 'year' },
    { key: 'NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID', id: config.NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID!, productName: 'Team', amount: '3900', interval: 'month' },
    { key: 'NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID', id: config.NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID!, productName: 'Team', amount: '37440', interval: 'year' },
  ];
}

export async function assertProductionPaddleCatalog(config: Config, reader?: PaddleCatalogReader): Promise<void> {
  if (config.NODE_ENV !== 'production' || config.PADDLE_ENV !== 'production') return;

  const catalog = reader ?? createPaddleCatalogReader(config.PADDLE_API_KEY!);
  const expected = expectedPrices(config);
  const activePrices = await catalog.listActivePrices();
  const issues: string[] = [];

  if (activePrices.length !== expected.length) {
    issues.push(`expected exactly ${expected.length} active prices, found ${activePrices.length}`);
  }

  const activeById = new Map(activePrices.map(price => [price.id, price]));
  const expectedProducts = new Map<string, 'Solo' | 'Team'>();
  for (const spec of expected) {
    const price = activeById.get(spec.id);
    if (!price) {
      issues.push(`${spec.key} does not reference an active Live price`);
      continue;
    }
    if (price.currencyCode !== 'EUR') issues.push(`${spec.key} must use EUR`);
    if (price.amount !== spec.amount) issues.push(`${spec.key} has the wrong amount`);
    if (price.interval !== spec.interval || price.frequency !== 1) issues.push(`${spec.key} has the wrong billing cycle`);
    const previousName = expectedProducts.get(price.productId);
    if (previousName && previousName !== spec.productName) issues.push('Solo and Team prices must belong to separate products');
    expectedProducts.set(price.productId, spec.productName);
  }

  if (expectedProducts.size !== 2) issues.push('the four prices must belong to exactly two products');
  for (const [productId, expectedName] of expectedProducts) {
    const product = await catalog.getProduct(productId);
    if (product.status !== 'active' || product.name !== expectedName) {
      issues.push(`${expectedName} prices must belong to an active product named ${expectedName}`);
    }
  }

  if (issues.length > 0) throw new Error(`Paddle Live catalog validation failed: ${issues.join('; ')}`);
}

function createPaddleCatalogReader(apiKey: string): PaddleCatalogReader {
  const paddle = new Paddle(apiKey, { environment: Environment.production });
  return {
    async listActivePrices() {
      const collection = paddle.prices.list({ status: ['active'], perPage: 200 });
      const prices = await collection.next();
      if (collection.hasMore) throw new Error('Paddle Live catalog validation failed: more than 200 active prices found');
      return prices.map(price => ({
        id: price.id,
        productId: price.productId,
        status: price.status,
        currencyCode: price.unitPrice.currencyCode,
        amount: price.unitPrice.amount,
        interval: price.billingCycle?.interval ?? null,
        frequency: price.billingCycle?.frequency ?? null,
      }));
    },
    async getProduct(id) {
      const product = await paddle.products.get(id);
      return { id: product.id, name: product.name, status: product.status };
    },
  };
}
