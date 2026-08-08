import { describe, expect, it, vi } from 'vitest';
import type { PaddleBillingRepository } from '../ports/repositories.port';
import { BillingContextService } from './billing-context.service';

function repository(): PaddleBillingRepository {
  return {
    findCustomerForUser: vi.fn(),
    findCustomerByEmail: vi.fn(),
    upsertCustomer: vi.fn(),
    upsertSubscription: vi.fn(),
    listSubscriptionsForUser: vi.fn(),
  };
}

describe('BillingContextService', () => {
  it('returns only the Paddle customer owned by the authenticated user', async () => {
    const repo = repository();
    vi.mocked(repo.findCustomerForUser).mockResolvedValue({ customerId: 'ctm_1', subscriptionIds: ['sub_1'] });

    await expect(new BillingContextService(repo).getForUser('user-1')).resolves.toEqual({
      paddleCustomerId: 'ctm_1',
    });
    expect(repo.findCustomerForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns a null customer id before the first checkout', async () => {
    const repo = repository();
    vi.mocked(repo.findCustomerForUser).mockResolvedValue(null);

    await expect(new BillingContextService(repo).getForUser('user-1')).resolves.toEqual({
      paddleCustomerId: null,
    });
  });
});
