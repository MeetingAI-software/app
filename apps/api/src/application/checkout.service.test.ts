import { describe, expect, it, vi } from 'vitest';
import type { PaddleBillingRepository, UserRepository } from '../ports/repositories.port';
import type { PaddleCheckoutPort } from '../ports/paddle-checkout.port';
import { InvalidBillingPriceError, SubscriptionAlreadyActiveError } from '../domain/errors';
import { CheckoutService } from './checkout.service';

function setup(options: { customerId?: string; status?: string } = {}) {
  const billingRepo = {
    listSubscriptionsForUser: vi.fn().mockResolvedValue(options.status ? [{ status: options.status }] : []),
    findCustomerForUser: vi.fn().mockResolvedValue(options.customerId
      ? { customerId: options.customerId, subscriptionIds: [] }
      : null),
    upsertCustomer: vi.fn(),
  } as unknown as PaddleBillingRepository;
  const userRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'person@example.com' }),
  } as unknown as UserRepository;
  const checkout: PaddleCheckoutPort = {
    createCustomer: vi.fn().mockResolvedValue('ctm_new'),
    createTransaction: vi.fn().mockResolvedValue('txn_1'),
  };
  return {
    service: new CheckoutService(billingRepo, userRepo, checkout, new Set(['pri_solo'])),
    billingRepo,
    checkout,
  };
}

describe('CheckoutService', () => {
  it('creates and mirrors a customer from the authenticated account before checkout', async () => {
    const { service, billingRepo, checkout } = setup();

    await expect(service.createForUser('user-1', 'pri_solo')).resolves.toBe('txn_1');
    expect(checkout.createCustomer).toHaveBeenCalledWith('person@example.com', 'user-1');
    expect(billingRepo.upsertCustomer).toHaveBeenCalledWith({ customerId: 'ctm_new', email: 'person@example.com' });
    expect(checkout.createTransaction).toHaveBeenCalledWith({
      customerId: 'ctm_new', priceId: 'pri_solo', appUserId: 'user-1',
    });
  });

  it('reuses the customer already owned by the app user', async () => {
    const { service, checkout } = setup({ customerId: 'ctm_existing' });
    await service.createForUser('user-1', 'pri_solo');
    expect(checkout.createCustomer).not.toHaveBeenCalled();
    expect(checkout.createTransaction).toHaveBeenCalledWith({
      customerId: 'ctm_existing', priceId: 'pri_solo', appUserId: 'user-1',
    });
  });

  it('rejects price ids outside the server catalog', async () => {
    const { service, checkout } = setup();
    await expect(service.createForUser('user-1', 'pri_attacker')).rejects.toThrow(InvalidBillingPriceError);
    expect(checkout.createTransaction).not.toHaveBeenCalled();
  });

  it('prevents a second checkout while a paid subscription is active', async () => {
    const { service, checkout } = setup({ status: 'active' });
    await expect(service.createForUser('user-1', 'pri_solo')).rejects.toThrow(SubscriptionAlreadyActiveError);
    expect(checkout.createTransaction).not.toHaveBeenCalled();
  });
});
