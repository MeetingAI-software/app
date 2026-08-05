import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import {
  clearVerificationRequestCache,
  EMAIL_VERIFICATION_COMPLETED_EVENT,
  EMAIL_VERIFICATION_STORAGE_KEY,
  notifyEmailVerificationCompleted,
  stateForVerificationError,
  verifyEmailOnce,
} from './verify-email';

describe('stateForVerificationError', () => {
  it.each([
    ['INVALID_VERIFICATION_TOKEN', 'invalid-token'],
    ['VERIFICATION_TOKEN_EXPIRED', 'expired-token'],
    ['VERIFICATION_TOKEN_USED', 'used-token'],
    ['EMAIL_ALREADY_VERIFIED', 'already-verified'],
    // A lost write leaves the token unconsumed, so this state has to say "click the link again"
    // rather than share the generic error copy, which sends people back to the login page.
    ['VERIFICATION_NOT_PERSISTED', 'not-persisted'],
  ] as const)('maps %s to %s', (code, state) => {
    expect(stateForVerificationError(new ApiError('failed', 400, code))).toBe(state);
  });

  it('uses the safe fallback for unknown failures', () => {
    expect(stateForVerificationError(new Error('network failed'))).toBe('error');
    expect(stateForVerificationError(new ApiError('unexpected', 500, 'UNKNOWN'))).toBe('error');
  });
});

describe('verifyEmailOnce', () => {
  afterEach(() => {
    clearVerificationRequestCache();
    vi.unstubAllGlobals();
  });

  it('reuses an in-flight request for the same token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: {
        id: 'user-1',
        email: 'person@example.com',
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      emailVerificationRequired: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const firstRequest = verifyEmailOnce('same-token');
    const secondRequest = verifyEmailOnce('same-token');

    expect(secondRequest).toBe(firstRequest);
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('notifyEmailVerificationCompleted', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a cross-tab signal and dispatches a same-tab event', () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem }, dispatchEvent });

    notifyEmailVerificationCompleted();

    expect(setItem).toHaveBeenCalledWith(
      EMAIL_VERIFICATION_STORAGE_KEY,
      expect.any(String),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: EMAIL_VERIFICATION_COMPLETED_EVENT }),
    );
  });
});
