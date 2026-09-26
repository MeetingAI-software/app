import type { PaddleBillingRepository, UserRepository } from '../ports/repositories.port';
import type { PaddleCheckoutPort } from '../ports/paddle-checkout.port';
import {
  InvalidBillingPriceError,
  InvalidBillingQuantityError,
  PaddleNotConfiguredError,
  PaddleOwnershipConflictError,
  SubscriptionAlreadyActiveError,
} from '../domain/errors';

const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

export class CheckoutService {
  constructor(
    private readonly billingRepo: PaddleBillingRepository,
    private readonly userRepo: UserRepository,
    private readonly checkout: PaddleCheckoutPort,
    private readonly allowedPriceIds: ReadonlySet<string>,
    private readonly teamPriceIds: ReadonlySet<string>,
  ) {}

  async createForUser(userId: string, priceId: string, quantity = 1): Promise<string> {
    if (!this.allowedPriceIds.has(priceId)) {
      throw new InvalidBillingPriceError('The selected billing price is not available');
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new InvalidBillingQuantityError('Seat quantity must be a whole number between 1 and 100');
    }
    if (!this.teamPriceIds.has(priceId) && quantity !== 1) {
      throw new InvalidBillingQuantityError('Only Team subscriptions can include multiple seats');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw new PaddleNotConfiguredError('The authenticated account could not be loaded');

    const subscriptions = await this.billingRepo.listSubscriptionsForUser(userId);
    if (subscriptions.some((subscription) => ACCESS_STATUSES.has(subscription.status))) {
      throw new SubscriptionAlreadyActiveError('Manage your existing subscription instead of starting another one');
    }

    let customer = await this.billingRepo.findCustomerForUser(userId);
    if (!customer) {
      const customerId = await this.checkout.createCustomer(user.email, userId);
      if (!(await this.billingRepo.attachCustomerToUser({ customerId, email: user.email, userId }))) {
        throw new PaddleOwnershipConflictError();
      }
      customer = { customerId, subscriptionIds: [] };
    }

    // The customer was looked up by immutable app ownership or created for this user.
    return this.checkout.createTransaction({
      customerId: customer.customerId,
      priceId,
      quantity,
      appUserId: userId,
    });
  }
}
