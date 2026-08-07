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
  // Global cap on verification emails per rolling 24h — the backstop the in-memory route limiters
  // cannot be: it survives restarts and is indifferent to IP rotation. Sits well below Resend's
  // free-plan hard block of 100/day so a burst can never reach the provider's own wall, and env
  // rather than code (like MONTHLY_CAP_SECONDS) because it is the one number worth raising from
  // the dashboard at 2am without a deploy.
  EMAIL_DAILY_SEND_BUDGET: z.coerce.number().int().positive().default(30),
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
  // Set by the deploy pipeline to the merged commit SHA and echoed by /healthz. `railway up`
  // uploads a directory, not a commit, so without this there is no way to ask production which
  // code it is actually running — the previous answer was to fingerprint an incidental header.
  GIT_COMMIT: z.string().default('unknown'),
  // --- Day 7: Gemini provider (behind the existing chat/document ports) ---
  GEMINI_API_KEY: z.string().optional(),       // required at boot IF either provider is 'gemini' (see superRefine)
  GEMINI_CHAT_MODEL: z.string().default(''),   // set a real id from Google's current docs, e.g. gemini-2.5-flash
  GEMINI_DOC_MODEL: z.string().default(''),    // e.g. gemini-2.5-pro
  // --- Google OAuth ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Must match an Authorized redirect URI in the Google Cloud console exactly, and points at the
  // API host (that is where the callback sets the session cookie). Same shape as WEB_ORIGIN: a
  // localhost default so dev needs no config, rejected in production by superRefine. This used to
  // be a raw process.env read in the route, which silently sent production users to localhost.
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/auth/google/callback'),
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

  // WEB_ORIGIN has a localhost default so `npm run dev` needs no config, but that default is a
  // silent outage in production: CORS and originCheck both compare it with `===`, so a wrong value
  // means every login POST 403s and the browser reports a bare "failed to fetch".
  if (cfg.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(cfg.WEB_ORIGIN)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEB_ORIGIN'],
      message: 'WEB_ORIGIN must be the public site origin (e.g. https://www.syncmemos.com) when NODE_ENV is "production"',
    });
  }
  // Same class of bug: the OAuth callback URL used to fall back to localhost inside the route, so
  // "Continue with Google" sent production users to their own machine.
  if (cfg.NODE_ENV === 'production' && cfg.GOOGLE_CLIENT_ID && /localhost|127\.0\.0\.1/.test(cfg.GOOGLE_REDIRECT_URI)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GOOGLE_REDIRECT_URI'],
      message: 'GOOGLE_REDIRECT_URI must be the public API callback URL (e.g. https://api.syncmemos.com/api/auth/google/callback) when NODE_ENV is "production"',
    });
  }

  const paddleApiKey = cfg.PADDLE_API_KEY ?? cfg.PADDLE_SANDBOX_API_KEY;
  const paddleCheckoutPrices = [
    ['NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID', cfg.NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID],
    ['NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID', cfg.NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID],
    ['NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID', cfg.NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID],
    ['NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID', cfg.NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID],
  ] as const;

  // Checkout is created by the API, so Railway needs the same catalog IDs as the separately
  // deployed frontend. Starting with an API key but an incomplete allowlist otherwise produces
  // a misleading 400 "selected billing price is not available" before Paddle is ever called.
  if (paddleApiKey) {
    for (const [key, value] of paddleCheckoutPrices) {
      if (!value || value.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when Paddle checkout is configured`,
        });
      } else if (!value.startsWith('pri_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be a Paddle price ID`,
        });
      }
    }
  }
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
