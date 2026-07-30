import type { PaddleBillingRepository } from '../ports/repositories.port';
import type { CustomerPortalPort } from '../ports/customer-portal.port';
import { PaddleCustomerNotFoundError } from '../domain/errors';

export class CustomerPortalService {
  constructor(
    private readonly billingRepo: PaddleBillingRepository,
    private readonly portal: CustomerPortalPort,
  ) {}

  async createForUser(userId: string): Promise<string> {
    const customer = await this.billingRepo.findCustomerForUser(userId);
    if (!customer) {
      throw new PaddleCustomerNotFoundError('Complete a subscription checkout before opening billing management');
    }

    // Customer ownership is resolved exclusively from the authenticated app user.
    return this.portal.createSession(customer.customerId, customer.subscriptionIds);
  }
}
