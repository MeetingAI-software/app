import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, resendVerification, verifyEmail } from './api';

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
