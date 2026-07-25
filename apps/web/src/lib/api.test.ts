import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, resendVerification } from './api';

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
