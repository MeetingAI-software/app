import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const base = { DATABASE_URL: 'postgres://synthetic:synthetic@localhost:5432/synthetic' };

describe('optional and defaulted environment values', () => {
  it.each(['', '  \t '])('normalizes blank optional values (%j) before validation', blank => {
    const parsed = envSchema.parse({ ...base, LEGAL_POLICIES_VERSION: blank,
      RECALL_BASE_URL: blank, PUBLIC_WEBHOOK_URL: blank, RECALL_API_KEY: blank,
      RESEND_API_KEY: blank, RESEND_FROM: blank, PADDLE_API_KEY: blank,
      PADDLE_SANDBOX_API_KEY: blank, PADDLE_NOTIFICATION_WEBHOOK_SECRET: blank,
    });
    expect(parsed.LEGAL_POLICIES_VERSION).toBeUndefined();
    expect(parsed.RECALL_BASE_URL).toBeUndefined();
    expect(parsed.PUBLIC_WEBHOOK_URL).toBeUndefined();
    expect(parsed.PADDLE_API_KEY).toBeUndefined();
  });

  it.each(['', ' \t '])('applies numeric defaults before coercion (%j)', blank => {
    const defaults = { PORT: 3000, MAX_UPLOAD_MB: 50, MAX_CONCURRENT_UPLOADS: 1,
      MONTHLY_CAP_SECONDS: 14400, MAX_MEETING_SECONDS: 3600, MAX_CONCURRENT_BOTS: 1,
      MAX_LIVE_STREAM_CONNECTIONS: 50, MAX_LIVE_STREAM_CONNECTIONS_PER_USER: 5,
      MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING: 3, MAX_TRANSCRIPT_CHARS: 180000,
      CLAUDE_TIMEOUT_MS: 60000, CHAT_TIMEOUT_MS: 30000, EMAIL_DAILY_SEND_BUDGET: 30,
      MAX_CHAT_QUESTIONS_PER_MEETING: 20, SESSION_TTL_DAYS: 30 };
    const parsed = envSchema.parse({ ...base, ...Object.fromEntries(Object.keys(defaults).map(key => [key, blank])) });
    expect(parsed).toMatchObject(defaults);
  });

  it.each(['../../.env.example', '.env.example'])('parses the actual %s template using only synthetic required values', file => {
    // Deliberately never read .env or any deployed configuration.
    const template = dotenv.parse(readFileSync(file));
    expect(envSchema.safeParse({ ...template, ...base }).success).toBe(true);
    expect(envSchema.safeParse({ ...template, ...base, NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.test' }).success).toBe(true);
  });

  it.each([
    { BOT_PROVIDER: 'recall', RECALL_API_KEY: ' ', RECALL_BASE_URL: '', PUBLIC_WEBHOOK_URL: '' },
    { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: ' ', RESEND_FROM: '' },
    { CHAT_PROVIDER: 'gemini', GEMINI_API_KEY: ' ' },
    { NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.test', PUBLIC_REGISTRATION_ENABLED: 'true', LEGAL_POLICIES_PUBLISHED: 'true', LEGAL_POLICIES_VERSION: ' ' },
    { NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.test', IN_ROOM_RECORDING_ENABLED: 'true', ASSEMBLYAI_API_KEY: ' ' },
  ])('fails closed when an enabled provider or gate lacks required values: %j', values => {
    expect(envSchema.safeParse({ ...base, ...values }).success).toBe(false);
  });

  it.each([{ LEGAL_POLICIES_VERSION: 'latest' }, { RECALL_BASE_URL: 'wrong' },
    { PUBLIC_WEBHOOK_URL: 'wrong' }, { MAX_UPLOAD_MB: '0' }, { MAX_UPLOAD_MB: '101' },
    { MAX_CONCURRENT_UPLOADS: '-1' }, { PORT: 'NaN' }, { PORT: 'Infinity' }])('still rejects invalid nonblank values: %j', values => {
    expect(envSchema.safeParse({ ...base, ...values }).success).toBe(false);
  });
});
