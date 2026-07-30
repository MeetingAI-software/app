import { describe, expect, it, vi } from 'vitest';
import type { PaddleBillingRepository } from '../ports/repositories.port';
import type { CustomerPortalPort } from '../ports/customer-portal.port';
import { PaddleCustomerNotFoundError } from '../domain/errors';
import { CustomerPortalService } from './customer-portal.service';

function setup(customer: Awaited<ReturnType<PaddleBillingRepository['findCustomerForUser']>>) {
  const billingRepo = {
    findCustomerForUser: vi.fn().mockResolvedValue(customer),
  } as unknown as PaddleBillingRepository;
  const portal: CustomerPortalPort = { createSession: vi.fn().mockResolvedValue('https://sandbox-login.paddle.com/session') };
  return { service: new CustomerPortalService(billingRepo, portal), billingRepo, portal };
}

describe('CustomerPortalService', () => {
  it('mints a portal for the customer owned by the authenticated user', async () => {
    const { service, billingRepo, portal } = setup({ customerId: 'ctm_1', subscriptionIds: ['sub_1'] });

    await expect(service.createForUser('user-1')).resolves.toBe('https://sandbox-login.paddle.com/session');
    expect(billingRepo.findCustomerForUser).toHaveBeenCalledWith('user-1');
    expect(portal.createSession).toHaveBeenCalledWith('ctm_1', ['sub_1']);
  });

  it('rejects users without a Paddle customer before calling the SDK', async () => {
    const { service, portal } = setup(null);

    await expect(service.createForUser('user-1')).rejects.toThrow(PaddleCustomerNotFoundError);
    expect(portal.createSession).not.toHaveBeenCalled();
  });
});
