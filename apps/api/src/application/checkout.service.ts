import type { PaddleBillingRepository, UserRepository } from '../ports/repositories.port';
import type { PaddleCheckoutPort } from '../ports/paddle-checkout.port';
import {
  InvalidBillingPriceError,
  PaddleNotConfiguredError,
  SubscriptionAlreadyActiveError,
} from '../domain/errors';

const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

export class CheckoutService {
  constructor(
    private readonly billingRepo: PaddleBillingRepository,
    private readonly userRepo: UserRepository,
    private readonly checkout: PaddleCheckoutPort,
    private readonly allowedPriceIds: ReadonlySet<string>,
  ) {}

  async createForUser(userId: string, priceId: string): Promise<string> {
    if (!this.allowedPriceIds.has(priceId)) {
      throw new InvalidBillingPriceError('The selected billing price is not available');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw new PaddleNotConfiguredError('The authenticated account could not be loaded');

    let customer = await this.billingRepo.findCustomerForUser(userId);
    if (!customer) {
      customer = await this.billingRepo.findCustomerByEmail(user.email);
      if (customer) {
        // Account deletion intentionally keeps Paddle's billing record. If the same
        // verified email registers again, reclaim that customer instead of asking
        // Paddle to create a duplicate customer for the email address.
        await this.billingRepo.upsertCustomer({ customerId: customer.customerId, email: user.email });
      }
    }
    if (!customer) {
      const customerId = await this.checkout.createCustomer(user.email, userId);
      await this.billingRepo.upsertCustomer({ customerId, email: user.email });
      customer = { customerId, subscriptionIds: [] };
    }

    // Check after an orphaned customer has been reclaimed so subscriptions that
    // survived account deletion still block a second checkout.
    const subscriptions = await this.billingRepo.listSubscriptionsForUser(userId);
    if (subscriptions.some((subscription) => ACCESS_STATUSES.has(subscription.status))) {
      throw new SubscriptionAlreadyActiveError('Manage your existing subscription instead of starting another one');
    }

    return this.checkout.createTransaction({ customerId: customer.customerId, priceId, appUserId: userId });
  }
}
