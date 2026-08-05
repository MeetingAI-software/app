import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';

type Values = Record<string, string>;

const repoRoot = path.resolve(__dirname, '../../../..');

function readEnv(relativePath: string): Values {
  const fullPath = path.join(repoRoot, relativePath);
  return fs.existsSync(fullPath) ? dotenv.parse(fs.readFileSync(fullPath)) : {};
}

function configured(value: string | undefined): value is string {
  return Boolean(value && !/your_|pri_(solo|team|business)/i.test(value));
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

  const priceKeys = [
    'NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID',
    'NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID',
    'NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID',
    'NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID',
  ] as const;
  const prices = priceKeys.map((key) => ({ key, id: web[key] }));
  for (const price of prices) {
    if (!configured(price.id)) issues.push(`${price.key} is missing`);
    else if (!price.id.startsWith('pri_')) issues.push(`${price.key} is not a Paddle price ID`);

    const apiPrice = api[price.key];
    if (!configured(apiPrice)) issues.push(`${price.key} is missing from the API configuration`);
    else if (configured(price.id) && apiPrice !== price.id) {
      issues.push(`${price.key} differs between the API and frontend configurations`);
    }
  }

  console.log(`Paddle environment: ${environment}`);
  console.log(`Frontend checkout: ${configured(token) && prices.every((price) => configured(price.id)) ? 'configured' : 'incomplete'}`);
  console.log(`Webhook backend: ${configured(apiKey) && configured(webhookSecret) ? 'configured' : 'incomplete'}`);

  const canCheckCatalog = configured(apiKey)
    && apiKey.startsWith(expectedApiPrefix)
    && prices.every((price) => configured(price.id))
    && (environment === 'sandbox' || environment === 'production');
  if (canCheckCatalog) {
    const paddle = new Paddle(apiKey, {
      environment: environment === 'production' ? Environment.production : Environment.sandbox,
    });
    let catalogValid = true;
    for (const { key, id } of prices) {
      try {
        const price = await paddle.prices.get(id!);
        if (price.status !== 'active') {
          catalogValid = false;
          issues.push(`${key} points to an archived price`);
        }
      } catch (error) {
        catalogValid = false;
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`${key} could not be fetched from Paddle: ${message}`);
      }
    }
    if (catalogValid) console.log(`Paddle catalog: ${prices.length} active checkout prices verified`);

    try {
      const settings = await paddle.notificationSettings.list({ active: true, perPage: 200 });
      const requiredEvents = new Set([
        'customer.created',
        'customer.updated',
        'subscription.created',
        'subscription.updated',
        'subscription.canceled',
      ]);
      const readyDestinations = settings.filter((setting) => {
        const subscribed = new Set<string>(setting.subscribedEvents.map((event) => event.name));
        return [...requiredEvents].every((event) => subscribed.has(event));
      });
      console.log(`Paddle notifications: ${settings.length} active, ${readyDestinations.length} subscribed to required events`);
      if (readyDestinations.length === 0) {
        issues.push('No active Paddle notification destination subscribes to all required customer/subscription events');
      } else if (configured(webhookSecret)
        && !readyDestinations.some((setting) => setting.endpointSecretKey === webhookSecret)) {
        issues.push('Configured webhook secret does not match any ready Paddle notification destination');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`Notification destinations could not be fetched from Paddle: ${message}`);
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
