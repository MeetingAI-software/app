import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const productionBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  WEB_ORIGIN: 'https://www.syncmemos.com',
};

describe('in-room recording environment validation', () => {
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
