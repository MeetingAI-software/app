// Tests must never depend on a real .env: config/env.ts calls process.exit(1)
// on validation failure, which kills the vitest worker mid-import.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.BOT_PROVIDER = 'fake';
process.env.DOC_PROVIDER = 'fake';
process.env.CHAT_PROVIDER = 'fake';
process.env.TRANSCRIPTION_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'log';
process.env.ANTHROPIC_API_KEY = 'test-key';

// Provider tests opt into credentials explicitly. Never inherit a developer's real configuration.
delete process.env.RECALL_API_KEY;
delete process.env.RECALL_BASE_URL;
delete process.env.RECALL_WEBHOOK_SECRET;
delete process.env.RECALL_REALTIME_WEBHOOK_SECRET;
process.env.PUBLIC_REGISTRATION_ENABLED = 'true';
process.env.LEGAL_POLICIES_PUBLISHED = 'true';
process.env.LEGAL_POLICIES_VERSION = '2026-08-24';
delete process.env.ASSEMBLYAI_API_KEY;
delete process.env.TRANSCRIPTION_WEBHOOK_SECRET;
delete process.env.RESEND_API_KEY;

// Billing tests must not inherit developer or CI Paddle credentials. Individual tests that need
// billing configuration set it explicitly after config has been parsed.
delete process.env.PADDLE_API_KEY;
delete process.env.PADDLE_SANDBOX_API_KEY;
delete process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET;
process.env.PADDLE_ENV = 'sandbox';
process.env.BILLING_MUTATIONS_ENABLED = 'false';
