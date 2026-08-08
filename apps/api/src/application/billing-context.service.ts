import type { PaddleBillingRepository } from '../ports/repositories.port';

export interface BillingContext {
  paddleCustomerId: string | null;
}

/**
 * Returns the minimum browser-safe identity Paddle.js needs for Paddle Retain.
 * The customer id is resolved only from the authenticated app user; callers can
 * never supply or probe a Paddle id belonging to another account.
 */
export class BillingContextService {
  constructor(private readonly billingRepo: PaddleBillingRepository) {}

  async getForUser(userId: string): Promise<BillingContext> {
    const customer = await this.billingRepo.findCustomerForUser(userId);
    return { paddleCustomerId: customer?.customerId ?? null };
  }
}
