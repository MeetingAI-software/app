import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import {
  canCheckRemote,
  isConfigured,
  resolveReadiness,
  validateCatalog,
  validateConfiguration,
  validateNotifications,
  type CatalogPriceSnapshot,
  type CatalogProductSnapshot,
  type Values,
} from './paddle-readiness-core';

const repoRoot = path.resolve(__dirname, '../../../..');

function readEnv(relativePath: string): Values {
  const fullPath = path.join(repoRoot, relativePath);
  return fs.existsSync(fullPath) ? dotenv.parse(fs.readFileSync(fullPath)) : {};
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
  const resolved = resolveReadiness(api, web);
  const issues = validateConfiguration(api, web, resolved);

  console.log(`Paddle environment: ${resolved.environment}`);
  console.log(`Frontend checkout: ${isConfigured(resolved.token) && resolved.prices.every((price) => isConfigured(price.id)) ? 'configured' : 'incomplete'}`);
  console.log(`Webhook backend: ${isConfigured(resolved.apiKey) && isConfigured(resolved.webhookSecret) ? 'configured' : 'incomplete'}`);
  console.log(`Billing mutations: ${resolved.billingMutationsEnabled ? 'ENABLED (controlled test window)' : 'disabled'}`);

  if (canCheckRemote(resolved)) {
    const paddle = new Paddle(resolved.apiKey, {
      environment: resolved.environment === 'production' ? Environment.production : Environment.sandbox,
    });
    try {
      const activeCollection = paddle.prices.list({ status: ['active'], perPage: 200 });
      const activePrices = await activeCollection.next();
      const snapshots: CatalogPriceSnapshot[] = activePrices.map((price) => ({
        id: price.id,
        productId: price.productId,
        currencyCode: price.unitPrice.currencyCode,
        amount: price.unitPrice.amount,
        interval: price.billingCycle?.interval ?? null,
        frequency: price.billingCycle?.frequency ?? null,
      }));
      const productIds = [...new Set(snapshots.map((price) => price.productId))];
      const products: CatalogProductSnapshot[] = [];
      for (const productId of productIds) {
        const product = await paddle.products.get(productId);
        products.push({ id: product.id, name: product.name, status: product.status });
      }
      const catalogIssues = validateCatalog(resolved, snapshots, products, activeCollection.hasMore);
      issues.push(...catalogIssues);
      if (catalogIssues.length === 0) console.log('Paddle catalog: exactly 2 products and 4 active EUR prices verified');
    } catch (error) {
      issues.push(`Catalog verification request failed: ${safeFailure(error)}`);
    }

    try {
      const settings = await paddle.notificationSettings.list({ active: true, perPage: 200 });
      const notificationResult = validateNotifications(resolved, settings.map((setting) => ({
        type: setting.type,
        destination: setting.destination,
        subscribedEvents: setting.subscribedEvents.map((event) => event.name),
        endpointSecretKey: setting.endpointSecretKey,
      })));
      issues.push(...notificationResult.issues);
      console.log(`Paddle notifications: ${settings.length} active, ${notificationResult.readyCount} subscribed to required events`);
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
