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
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  CLAUDE_TIMEOUT_MS: z.coerce.number().default(60000),
  MAX_TRANSCRIPT_CHARS: z.coerce.number().default(180000),
  DOC_PROVIDER: z.enum(['fake', 'claude']).default('fake'),
  WEB_ORIGIN: z.string().default('http://localhost:3001'),
  // --- Day 3: in-room recording + chat ---
  ASSEMBLYAI_API_KEY: z.string().optional(),
  ASSEMBLYAI_BASE_URL: z.string().url().default('https://api.assemblyai.com'),
  TRANSCRIPTION_PROVIDER: z.enum(['fake', 'assemblyai']).default('fake'),
  TRANSCRIPTION_WEBHOOK_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  MAX_CHAT_QUESTIONS_PER_MEETING: z.coerce.number().default(20),
  MAX_UPLOAD_MB: z.coerce.number().default(200),
  CHAT_PROVIDER: z.enum(['fake', 'claude']).default('fake'),
  // --- Day 5: accounts + sessions ---
  SESSION_TTL_DAYS: z.coerce.number().int().default(30),
  // --- Day 6: observability ---
  SENTRY_DSN: z.string().optional(),   // optional everywhere; observability is a no-op when unset
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
