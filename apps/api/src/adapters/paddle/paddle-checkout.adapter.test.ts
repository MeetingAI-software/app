import { ApiError } from '@paddle/paddle-node-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaddleOwnershipConflictError } from '../../domain/errors';
import { PaddleCheckoutAdapter } from './paddle-checkout.adapter';
import { getPaddleClient } from './paddle-client';

vi.mock('./paddle-client', () => ({ getPaddleClient: vi.fn() }));

describe('PaddleCheckoutAdapter', () => {
  const create = vi.fn();

  beforeEach(() => {
    create.mockReset();
    vi.mocked(getPaddleClient).mockReturnValue({ customers: { create } } as never);
  });

  it('does not recover a provider customer whose email belongs to another account', async () => {
    create.mockRejectedValue(new ApiError({
      type: 'request_error', code: 'customer_already_exists',
      detail: 'A customer with this email already exists', documentation_url: '',
    }, null));

    await expect(new PaddleCheckoutAdapter().createCustomer('reused@example.com', 'new-user'))
      .rejects.toThrow(PaddleOwnershipConflictError);
    expect(create).toHaveBeenCalledWith({
      email: 'reused@example.com', customData: { appUserId: 'new-user' },
    });
  });

  it('does not turn an unrelated provider failure into an ownership conflict', async () => {
    const failure = new Error('provider unavailable');
    create.mockRejectedValue(failure);
    await expect(new PaddleCheckoutAdapter().createCustomer('user@example.com', 'user'))
      .rejects.toBe(failure);
  });
});
