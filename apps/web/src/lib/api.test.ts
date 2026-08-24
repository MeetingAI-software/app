import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createCheckoutTransaction,
  createMeeting,
  getOptionalBillingContext,
  resendVerification,
  throttleMessage,
  verifyEmail,
} from './api';
import { RECORDING_NOTICE_VERSION } from './recording-notice';

describe('throttleMessage', () => {
  it('gives the rate limit its own sentence instead of the raw server string', () => {
    expect(throttleMessage(new ApiError('Too many attempts, try again later', 429, 'RATE_LIMITED')))
      .toBe('Too many attempts. Please wait a while and try again.');
  });

  it('explains an exhausted send budget as temporary and not the user\'s fault', () => {
    expect(throttleMessage(new ApiError('unavailable', 503, 'EMAIL_BUDGET_EXHAUSTED')))
      .toContain('temporarily unable to send verification emails');
  });

  // Returning null rather than a fallback string is what lets each screen keep its own specific
  // copy for 401/409 — this helper only claims the two errors it actually knows about.
  it('declines everything else so the caller keeps its own handling', () => {
    expect(throttleMessage(new ApiError('Incorrect password', 401))).toBeNull();
    expect(throttleMessage(new ApiError('Email taken', 409, 'EMAIL_TAKEN'))).toBeNull();
    expect(throttleMessage(new Error('offline'))).toBeNull();
    expect(throttleMessage(null)).toBeNull();
  });
});

describe('resendVerification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the email through the credentialed API client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'sent' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await resendVerification('person@example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/resend-verification',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'person@example.com' }),
      }),
    );
  });

  it('surfaces delivery failures to the banner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Unable to send verification email' } }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));

    await expect(resendVerification('person@example.com')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'Unable to send verification email',
    } satisfies Partial<ApiError>);
  });

  it('reports the rate limit so the banner can say "try again later"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    )));

    await expect(resendVerification('person@example.com')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });
});

describe('error codes on ordinary data calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // handleResponse used to drop `error.code`, which left the UI matching on message text. The
  // verification gate depends on the code surviving, so this pins the behaviour.
  it('preserves EMAIL_NOT_VERIFIED from a gated endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address to continue' } }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )));

    await expect(createMeeting('https://zoom.us/j/123', {
      confirmed: true,
      version: RECORDING_NOTICE_VERSION,
    })).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('falls back to the status line when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<html>Bad Gateway</html>', { status: 502 }),
    ));

    await expect(createMeeting('https://zoom.us/j/123', {
      confirmed: true,
      version: RECORDING_NOTICE_VERSION,
    })).rejects.toMatchObject({
      status: 502,
      code: undefined,
      message: 'HTTP error! Status: 502',
    });
  });
});

describe('getOptionalBillingContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the authenticated Paddle customer id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ paddleCustomerId: 'ctm_1' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(getOptionalBillingContext()).resolves.toEqual({ paddleCustomerId: 'ctm_1' });
  });

  it('treats an anonymous pricing-page visitor as having no Paddle customer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )));

    await expect(getOptionalBillingContext()).resolves.toBeNull();
  });
});

describe('createCheckoutTransaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the selected Team seat quantity to the authenticated checkout endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ transactionId: 'txn_1' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCheckoutTransaction('pri_team', 4)).resolves.toEqual({ transactionId: 'txn_1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me/checkout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ priceId: 'pri_team', quantity: 4 }),
      }),
    );
  });
});

describe('verifyEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the verified auth status from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: {
        id: 'user-1',
        email: 'person@example.com',
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      emailVerificationRequired: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(verifyEmail('valid-token')).resolves.toMatchObject({
      user: { emailVerified: true },
      emailVerificationRequired: false,
    });
  });

  it('preserves the backend error code for precise UI states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'VERIFICATION_TOKEN_EXPIRED',
        message: 'Verification token has expired',
      },
    }), { status: 410, headers: { 'content-type': 'application/json' } })));

    await expect(verifyEmail('expired-token')).rejects.toMatchObject({
      name: 'ApiError',
      status: 410,
      code: 'VERIFICATION_TOKEN_EXPIRED',
      message: 'Verification token has expired',
    });
  });
});
