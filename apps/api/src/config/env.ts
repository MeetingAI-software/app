import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config({ override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  BOT_PROVIDER: z.enum(['fake', 'recall']).default('fake'),
  RECALL_API_KEY: z.string().optional(),
  RECALL_BASE_URL: z.string().optional(),
  RECALL_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_WEBHOOK_URL: z.string().optional(),
  MONTHLY_CAP_SECONDS: z.coerce.number().default(14400),
  MAX_MEETING_SECONDS: z.coerce.number().default(3600),
  MAX_CONCURRENT_BOTS: z.coerce.number().default(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
