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
  // Live transcription. Recall's realtime endpoints are configured per bot and are NOT Svix-signed
  // like the workspace webhook, so they authenticate with a shared token in the query string.
  RECALL_LIVE_WEBHOOK_TOKEN: z.string().optional(),
  // Kill switch: turns off `realtime_endpoints` on newly created bots without a code change.
  // Bots already in a call keep streaming; only new meetings are affected.
  // Not `z.coerce.boolean()` — that maps the string "false" to true, which is the opposite of
  // what anyone setting LIVE_TRANSCRIPT_ENABLED=false intends.
  LIVE_TRANSCRIPT_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  MONTHLY_CAP_SECONDS: z.coerce.number().default(14400),
  MAX_MEETING_SECONDS: z.coerce.number().default(3600),
  MAX_CONCURRENT_BOTS: z.coerce.number().default(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  CLAUDE_TIMEOUT_MS: z.coerce.number().default(60000),
  MAX_TRANSCRIPT_CHARS: z.coerce.number().default(180000),
  DOC_PROVIDER: z.enum(['fake', 'claude', 'gemini']).default('fake'),
  WEB_ORIGIN: z.string().default('http://localhost:3001'),
  EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().min(1).optional(),
  // --- Day 3: in-room recording + chat ---
  ASSEMBLYAI_API_KEY: z.string().optional(),
  ASSEMBLYAI_BASE_URL: z.string().url().default('https://api.assemblyai.com'),
  TRANSCRIPTION_PROVIDER: z.enum(['fake', 'assemblyai']).default('fake'),
  TRANSCRIPTION_WEBHOOK_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  MAX_CHAT_QUESTIONS_PER_MEETING: z.coerce.number().default(20),
  MAX_UPLOAD_MB: z.coerce.number().default(200),
  CHAT_PROVIDER: z.enum(['fake', 'claude', 'gemini']).default('fake'),
  // --- Day 5: accounts + sessions ---
  SESSION_TTL_DAYS: z.coerce.number().int().default(30),
  // --- Day 6: observability ---
  SENTRY_DSN: z.string().optional(),   // optional everywhere; observability is a no-op when unset
  // --- Day 7: Gemini provider (behind the existing chat/document ports) ---
  GEMINI_API_KEY: z.string().optional(),       // required at boot IF either provider is 'gemini' (see superRefine)
  GEMINI_CHAT_MODEL: z.string().default(''),   // set a real id from Google's current docs, e.g. gemini-2.5-flash
  GEMINI_DOC_MODEL: z.string().default(''),    // e.g. gemini-2.5-pro
  // --- Google OAuth ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // --- Paddle Billing ---
  PADDLE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PADDLE_API_KEY: z.string().min(1).optional(),
  PADDLE_SANDBOX_API_KEY: z.string().min(1).optional(),
  PADDLE_NOTIFICATION_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_PADDLE_BUSINESS_ANNUAL_PRICE_ID: z.string().optional(),
}).superRefine((cfg, ctx) => {
  // Same fail-fast standard as everything else: don't boot half-configured for a paid vendor.
  if (cfg.BOT_PROVIDER === 'recall') {
    const required = [
      ['RECALL_API_KEY', cfg.RECALL_API_KEY],
      ['RECALL_BASE_URL', cfg.RECALL_BASE_URL],
      ['RECALL_WEBHOOK_SECRET', cfg.RECALL_WEBHOOK_SECRET],
      ['PUBLIC_WEBHOOK_URL', cfg.PUBLIC_WEBHOOK_URL],
      // Without it the live webhook URL we hand Recall would carry an empty token and every
      // live utterance would be rejected — a silently dead live transcript, not a loud failure.
      ...(cfg.LIVE_TRANSCRIPT_ENABLED
        ? ([['RECALL_LIVE_WEBHOOK_TOKEN', cfg.RECALL_LIVE_WEBHOOK_TOKEN]] as const)
        : []),
    ] as const;
    for (const [key, value] of required) {
      if (!value || value.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when BOT_PROVIDER is "recall"`,
        });
      }
    }
    // The provider calls us, so a loopback address means webhooks can never arrive and the
    // pipeline silently stalls at bot_joining. Fail at boot instead.
    if (cfg.PUBLIC_WEBHOOK_URL && /localhost|127\.0\.0\.1/.test(cfg.PUBLIC_WEBHOOK_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_WEBHOOK_URL'],
        message: 'PUBLIC_WEBHOOK_URL must be a publicly reachable https URL (e.g. an ngrok tunnel) when BOT_PROVIDER is "recall"',
      });
    }
  }
  if ((cfg.CHAT_PROVIDER === 'gemini' || cfg.DOC_PROVIDER === 'gemini') && !cfg.GEMINI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'GEMINI_API_KEY is required when CHAT_PROVIDER or DOC_PROVIDER is "gemini"',
    });
  }
  if (cfg.EMAIL_PROVIDER === 'resend' && !cfg.RESEND_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is "resend"',
    });
  }
  if (cfg.EMAIL_PROVIDER === 'resend' && !cfg.RESEND_FROM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_FROM'],
      message: 'RESEND_FROM is required when EMAIL_PROVIDER is "resend"',
    });
  }

  const paddleApiKey = cfg.PADDLE_API_KEY ?? cfg.PADDLE_SANDBOX_API_KEY;
  if (cfg.PADDLE_NOTIFICATION_WEBHOOK_SECRET && !paddleApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PADDLE_API_KEY'],
      message: 'A Paddle API key is required when Paddle webhooks are configured',
    });
  }
  if (cfg.PADDLE_ENV === 'production' && paddleApiKey && !cfg.PADDLE_NOTIFICATION_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PADDLE_NOTIFICATION_WEBHOOK_SECRET'],
      message: 'Production Paddle requires PADDLE_NOTIFICATION_WEBHOOK_SECRET',
    });
  }
  if (cfg.PADDLE_ENV === 'production' && cfg.PADDLE_SANDBOX_API_KEY && !cfg.PADDLE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PADDLE_API_KEY'],
      message: 'Production must use PADDLE_API_KEY; a sandbox key is never used as a fallback',
    });
  }
  if (paddleApiKey && cfg.PADDLE_ENV === 'sandbox' && !paddleApiKey.startsWith('pdl_sdbx_apikey_')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PADDLE_API_KEY'],
      message: 'Sandbox Paddle keys must start with pdl_sdbx_apikey_',
    });
  }
  if (cfg.PADDLE_API_KEY && cfg.PADDLE_ENV === 'production' && !cfg.PADDLE_API_KEY.startsWith('pdl_live_apikey_')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PADDLE_API_KEY'],
      message: 'Production Paddle keys must start with pdl_live_apikey_',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
