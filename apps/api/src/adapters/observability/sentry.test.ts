import { describe, it, expect } from 'vitest';
import { initObservability, captureError } from './sentry';

// SENTRY_DSN is unset under test (test-setup.ts doesn't set it), so both calls must be safe no-ops.
describe('observability (no DSN)', () => {
  it('initObservability does not throw when SENTRY_DSN is unset', () => {
    expect(() => initObservability()).not.toThrow();
  });

  it('captureError is a safe no-op with and without context', () => {
    expect(() => captureError(new Error('boom'))).not.toThrow();
    expect(() => captureError(new Error('boom'), { meetingId: 'm1', userId: 'u1' })).not.toThrow();
  });
});
