import { describe, expect, it, vi } from 'vitest';
import type { PaddleBillingRepository, UserRepository } from '../ports/repositories.port';
import type { PaddleCheckoutPort } from '../ports/paddle-checkout.port';
import {
  InvalidBillingPriceError,
  InvalidBillingQuantityError,
  SubscriptionAlreadyActiveError,
} from '../domain/errors';
import { CheckoutService } from './checkout.service';

function setup(options: { customerId?: string; recoveredCustomerId?: string; status?: string } = {}) {
  const billingRepo = {
    listSubscriptionsForUser: vi.fn().mockResolvedValue(options.status ? [{ status: options.status }] : []),
    findCustomerForUser: vi.fn().mockResolvedValue(options.customerId
      ? { customerId: options.customerId, subscriptionIds: [] }
      : null),
    findCustomerByEmail: vi.fn().mockResolvedValue(options.recoveredCustomerId
      ? { customerId: options.recoveredCustomerId, subscriptionIds: [] }
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
    service: new CheckoutService(
      billingRepo,
      userRepo,
      checkout,
      new Set(['pri_solo', 'pri_team']),
      new Set(['pri_team']),
    ),
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
      customerId: 'ctm_new', priceId: 'pri_solo', quantity: 1, appUserId: 'user-1',
    });
  });

  it('reuses the customer already owned by the app user', async () => {
    const { service, checkout } = setup({ customerId: 'ctm_existing' });
    await service.createForUser('user-1', 'pri_solo');
    expect(checkout.createCustomer).not.toHaveBeenCalled();
    expect(checkout.createTransaction).toHaveBeenCalledWith({
      customerId: 'ctm_existing', priceId: 'pri_solo', quantity: 1, appUserId: 'user-1',
    });
  });

  it('reclaims an orphaned Paddle customer when the same email registers again', async () => {
    const { service, billingRepo, checkout } = setup({ recoveredCustomerId: 'ctm_recovered' });

    await service.createForUser('user-1', 'pri_solo');

    expect(billingRepo.findCustomerByEmail).toHaveBeenCalledWith('person@example.com');
    expect(billingRepo.upsertCustomer).toHaveBeenCalledWith({
      customerId: 'ctm_recovered', email: 'person@example.com',
    });
    expect(checkout.createCustomer).not.toHaveBeenCalled();
    expect(checkout.createTransaction).toHaveBeenCalledWith({
      customerId: 'ctm_recovered', priceId: 'pri_solo', quantity: 1, appUserId: 'user-1',
    });
  });

  it('blocks checkout when a reclaimed customer still has paid access', async () => {
    const { service, checkout } = setup({ recoveredCustomerId: 'ctm_recovered', status: 'active' });
    await expect(service.createForUser('user-1', 'pri_solo')).rejects.toThrow(SubscriptionAlreadyActiveError);
    expect(checkout.createTransaction).not.toHaveBeenCalled();
  });

  it('rejects price ids outside the server catalog', async () => {
    const { service, checkout } = setup();
    await expect(service.createForUser('user-1', 'pri_attacker')).rejects.toThrow(InvalidBillingPriceError);
    expect(checkout.createTransaction).not.toHaveBeenCalled();
  });

  it('passes the selected Team seat quantity to Paddle', async () => {
    const { service, checkout } = setup({ customerId: 'ctm_existing' });

    await service.createForUser('user-1', 'pri_team', 4);

    expect(checkout.createTransaction).toHaveBeenCalledWith({
      customerId: 'ctm_existing', priceId: 'pri_team', quantity: 4, appUserId: 'user-1',
    });
  });

  it('rejects multiple seats for Solo and unsafe Team quantities', async () => {
    const { service, checkout } = setup({ customerId: 'ctm_existing' });

    await expect(service.createForUser('user-1', 'pri_solo', 2))
      .rejects.toThrow(InvalidBillingQuantityError);
    await expect(service.createForUser('user-1', 'pri_team', 0))
      .rejects.toThrow(InvalidBillingQuantityError);
    await expect(service.createForUser('user-1', 'pri_team', 101))
      .rejects.toThrow(InvalidBillingQuantityError);
    expect(checkout.createTransaction).not.toHaveBeenCalled();
  });

  it('prevents a second checkout while a paid subscription is active', async () => {
    const { service, checkout } = setup({ status: 'active' });
    await expect(service.createForUser('user-1', 'pri_solo')).rejects.toThrow(SubscriptionAlreadyActiveError);
    expect(checkout.createTransaction).not.toHaveBeenCalled();
  });
});
