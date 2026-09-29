import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const productionBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  WEB_ORIGIN: 'https://www.syncmemos.com',
  BOT_PROVIDER: 'recall',
  RECALL_API_KEY: 'synthetic-recall-key',
  RECALL_BASE_URL: 'https://api.recall.test',
  RECALL_WEBHOOK_SECRET: 'synthetic-webhook-secret',
  PUBLIC_WEBHOOK_URL: 'https://api.syncmemos.com',
  LIVE_TRANSCRIPT_ENABLED: 'false',
  EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'synthetic-key', RESEND_FROM: 'no-reply@example.test',
};

describe('production mail delivery gate', () => {
  it('rejects a log-only mailer even while registration is closed', () => {
    const result = envSchema.safeParse({ ...productionBase, EMAIL_PROVIDER: 'log' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === 'EMAIL_PROVIDER')).toBe(true);
  });
});

describe('fake provider production gate', () => {
  it('rejects fake mode in production even with public registration disabled', () => {
    const result = envSchema.safeParse({ ...productionBase, BOT_PROVIDER: 'fake' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === 'BOT_PROVIDER')).toBe(true);
  });
});

describe('production transport URL validation', () => {
  it.each([
    ['WEB_ORIGIN', 'http://www.syncmemos.com'],
    ['WEB_ORIGIN', 'https://user:secret@www.syncmemos.com'],
    ['WEB_ORIGIN', 'https://www.syncmemos.com/path'],
    ['RECALL_BASE_URL', 'http://api.recall.test'],
    ['PUBLIC_WEBHOOK_URL', 'http://api.syncmemos.com'],
    ['ASSEMBLYAI_BASE_URL', 'http://api.assemblyai.com'],
    ['SUPABASE_URL', 'http://project.supabase.co'],
    ['SUPABASE_URL', 'not-a-url'],
    ['GOOGLE_REDIRECT_URI', 'http://api.syncmemos.com/api/auth/google/callback'],
    ['GOOGLE_REDIRECT_URI', 'https://api.syncmemos.com/other'],
  ])('rejects insecure %s=%s', (key, value) => {
    const result = envSchema.safeParse({
      ...productionBase, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'https://api.syncmemos.com/api/auth/google/callback',
      [key]: value,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === key)).toBe(true);
  });

  it('accepts secure production origins and the exact Google callback', () => {
    expect(envSchema.safeParse({
      ...productionBase, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'https://api.syncmemos.com/api/auth/google/callback',
      RECALL_BASE_URL: 'https://api.recall.test',
      PUBLIC_WEBHOOK_URL: 'https://api.syncmemos.com',
      SUPABASE_URL: 'https://project.supabase.co',
    }).success).toBe(true);
  });
});

describe('in-room recording environment validation', () => {
  it.each([undefined, 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://[::1]'])
    ('rejects an unreachable transcription callback origin %s', (origin) => {
      const result = envSchema.safeParse({
        ...productionBase,
        PUBLIC_WEBHOOK_URL: origin,
        IN_ROOM_RECORDING_ENABLED: 'true',
        TRANSCRIPTION_PROVIDER: 'assemblyai',
        ASSEMBLYAI_BASE_URL: 'https://api.eu.assemblyai.com',
        ASSEMBLYAI_API_KEY: 'eu-key',
        TRANSCRIPTION_WEBHOOK_SECRET: 'webhook-secret',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === 'PUBLIC_WEBHOOK_URL')).toBe(true);
    });

  it('allows production to boot with the feature disabled and the default AssemblyAI endpoint', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      IN_ROOM_RECORDING_ENABLED: 'false',
      ASSEMBLYAI_BASE_URL: 'https://api.assemblyai.com',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a complete EU-provisioned production pipeline', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      IN_ROOM_RECORDING_ENABLED: 'true',
      TRANSCRIPTION_PROVIDER: 'assemblyai',
      ASSEMBLYAI_BASE_URL: 'https://api.eu.assemblyai.com',
      ASSEMBLYAI_API_KEY: 'eu-key',
      TRANSCRIPTION_WEBHOOK_SECRET: 'webhook-secret',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });

    expect(result.success).toBe(true);
  });

  it('rejects the standard AssemblyAI endpoint when production in-room recording is enabled', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      IN_ROOM_RECORDING_ENABLED: 'true',
      TRANSCRIPTION_PROVIDER: 'assemblyai',
      ASSEMBLYAI_BASE_URL: 'https://api.assemblyai.com',
      ASSEMBLYAI_API_KEY: 'key',
      TRANSCRIPTION_WEBHOOK_SECRET: 'webhook-secret',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ASSEMBLYAI_BASE_URL).toContain(
        'ASSEMBLYAI_BASE_URL must be https://api.eu.assemblyai.com when in-room recording is enabled in production',
      );
    }
  });
});

describe('resource limit validation', () => {
  it.each([
    ['PORT', '0'],
    ['MAX_UPLOAD_MB', '101'],
    ['MAX_CONCURRENT_UPLOADS', '0'],
    ['MAX_CONCURRENT_BOTS', '-1'],
    ['MAX_LIVE_STREAM_CONNECTIONS', '0'],
    ['MAX_LIVE_STREAM_CONNECTIONS_PER_USER', '51'],
    ['MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING', '21'],
    ['SESSION_TTL_DAYS', '365'],
    ['CLAUDE_TIMEOUT_MS', '999999'],
  ])('rejects an unsafe %s value', (key, value) => {
    expect(envSchema.safeParse({ ...productionBase, [key]: value }).success).toBe(false);
  });

  it('applies bounded upload defaults', () => {
    const result = envSchema.parse(productionBase);
    expect(result.MAX_UPLOAD_MB).toBe(50);
    expect(result.MAX_CONCURRENT_UPLOADS).toBe(1);
    expect(result.MAX_LIVE_STREAM_CONNECTIONS).toBe(50);
    expect(result.MAX_LIVE_STREAM_CONNECTIONS_PER_USER).toBe(5);
    expect(result.MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING).toBe(3);
  });
});

describe('public registration safety gate', () => {
  it('rejects production registration without published, versioned policies', () => {
    expect(envSchema.safeParse({
      ...productionBase,
      PUBLIC_REGISTRATION_ENABLED: 'true',
    }).success).toBe(false);
  });

  it('accepts registration only with explicit legal publication evidence', () => {
    expect(envSchema.safeParse({
      ...productionBase,
      PUBLIC_REGISTRATION_ENABLED: 'true',
      LEGAL_POLICIES_PUBLISHED: 'true',
      LEGAL_POLICIES_VERSION: '2026-08-24',
    }).success).toBe(true);
  });
});

describe('Paddle Live environment validation', () => {
  const liveBase = {
    ...productionBase,
    PADDLE_ENV: 'production',
    PADDLE_API_KEY: 'pdl_live_apikey_example',
    PADDLE_NOTIFICATION_WEBHOOK_SECRET: 'pdl_ntfset_example',
    NEXT_PUBLIC_PADDLE_SOLO_MONTHLY_PRICE_ID: 'pri_solo_monthly',
    NEXT_PUBLIC_PADDLE_SOLO_ANNUAL_PRICE_ID: 'pri_solo_annual',
    NEXT_PUBLIC_PADDLE_TEAM_MONTHLY_PRICE_ID: 'pri_team_monthly',
    NEXT_PUBLIC_PADDLE_TEAM_ANNUAL_PRICE_ID: 'pri_team_annual',
  };

  it('accepts a complete Live-only configuration', () => {
    expect(envSchema.safeParse(liveBase).success).toBe(true);
  });

  it('requires the Live API key even while billing mutations are disabled', () => {
    const { PADDLE_API_KEY: _omitted, ...withoutKey } = liveBase;
    const result = envSchema.safeParse(withoutKey);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.PADDLE_API_KEY).toContain('Production Paddle requires PADDLE_API_KEY');
    }
  });

  it('rejects a retained sandbox key in production', () => {
    const result = envSchema.safeParse({ ...liveBase, PADDLE_SANDBOX_API_KEY: 'pdl_sdbx_apikey_old' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.PADDLE_SANDBOX_API_KEY).toContain(
        'PADDLE_SANDBOX_API_KEY must be removed when PADDLE_ENV is "production"',
      );
    }
  });
});
