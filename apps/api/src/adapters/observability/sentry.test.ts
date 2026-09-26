import { describe, it, expect } from 'vitest';
import { initObservability, captureError, sanitizeErrorEvent } from './sentry';

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

describe('telemetry redaction', () => {
  it('drops raw provider messages, breadcrumbs, request data, and unsafe tags from generic errors', () => {
    const marker = 'PRIVATE-MEETING-SPEECH-and-bearer-token';
    const requestId = '12345678-1234-1234-1234-123456789abc';
    const event = sanitizeErrorEvent({
      type: undefined, message: marker, request: { url: `https://example.test/${marker}` },
      exception: { values: [{ type: marker, value: marker, stacktrace: { frames: [] } }] },
      breadcrumbs: [{ message: marker }], extra: { secret: marker },
      contexts: { provider: { body: marker } }, user: { email: marker },
      tags: { requestId, meetingId: marker, unsafe: marker },
    } as never, new Error(marker));
    expect(JSON.stringify(event)).not.toContain(marker);
    expect(event.tags).toEqual({ requestId });
    expect(event.exception?.values?.[0]).toEqual({ type: 'Error', value: 'Application error' });
    const typed = sanitizeErrorEvent({ type: undefined, message: marker,
      tags: { component: 'email-send-budget', unsafe: marker } } as never, new TypeError(marker));
    expect(typed.exception?.values?.[0]).toEqual({ type: 'TypeError', value: 'Application error' });
    expect(typed.tags).toEqual({ component: 'email-send-budget' });
  });
});
