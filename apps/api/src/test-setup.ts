// Tests must never depend on a real .env: config/env.ts calls process.exit(1)
// on validation failure, which kills the vitest worker mid-import.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.BOT_PROVIDER ??= 'fake';
process.env.DOC_PROVIDER ??= 'fake';
process.env.ANTHROPIC_API_KEY ??= 'test-key';

// Billing tests must not inherit developer or CI Paddle credentials. Individual tests that need
// billing configuration set it explicitly after config has been parsed.
delete process.env.PADDLE_API_KEY;
delete process.env.PADDLE_SANDBOX_API_KEY;
delete process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET;
process.env.PADDLE_ENV = 'sandbox';
process.env.BILLING_MUTATIONS_ENABLED = 'false';
