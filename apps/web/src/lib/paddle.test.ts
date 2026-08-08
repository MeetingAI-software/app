import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializePaddle } from '@paddle/paddle-js';
import { getOptionalBillingContext } from './api';
import { getPaddle, getPaddlePriceId } from './paddle';

vi.mock('@paddle/paddle-js', () => ({ initializePaddle: vi.fn() }));
vi.mock('./api', () => ({ getOptionalBillingContext: vi.fn() }));

describe('getPaddlePriceId', () => {
  it('does not create checkout for the free plan', () => {
    expect(getPaddlePriceId('free', false)).toBeNull();
  });

  it('does not create checkout for the contact-only Business plan', () => {
    expect(getPaddlePriceId('business', false)).toBeNull();
    expect(getPaddlePriceId('business', true)).toBeNull();
  });
});

describe('getPaddle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    delete process.env.NEXT_PUBLIC_PADDLE_ENV;
  });

  it('initializes once with the authenticated Paddle customer and payment-link defaults', async () => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_token';
    process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox';
    vi.stubGlobal('window', { location: { origin: 'https://www.syncmemos.com' } });
    vi.mocked(getOptionalBillingContext).mockResolvedValue({ paddleCustomerId: 'ctm_1' });
    const paddle = { Initialized: true } as never;
    vi.mocked(initializePaddle).mockResolvedValue(paddle);

    await expect(getPaddle()).resolves.toBe(paddle);
    await expect(getPaddle()).resolves.toBe(paddle);

    expect(initializePaddle).toHaveBeenCalledTimes(1);
    expect(initializePaddle).toHaveBeenCalledWith({
      token: 'test_token',
      environment: 'sandbox',
      pwCustomer: { id: 'ctm_1' },
      checkout: {
        settings: {
          displayMode: 'overlay',
          variant: 'one-page',
          successUrl: 'https://www.syncmemos.com/checkout/success',
        },
      },
    });
  });
});
