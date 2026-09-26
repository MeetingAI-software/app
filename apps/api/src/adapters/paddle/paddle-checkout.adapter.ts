import type { PaddleCheckoutPort } from '../../ports/paddle-checkout.port';
import { ApiError } from '@paddle/paddle-node-sdk';
import { PaddleNotConfiguredError, PaddleOwnershipConflictError } from '../../domain/errors';
import { getPaddleClient } from './paddle-client';

export class PaddleCheckoutAdapter implements PaddleCheckoutPort {
  async createCustomer(email: string, appUserId: string): Promise<string> {
    const paddle = this.client();
    let customer;
    try {
      customer = await paddle.customers.create({ email, customData: { appUserId } });
    } catch (error) {
      // Paddle enforces unique customer email. A former holder of this address may still own the
      // provider customer. Never recover it by email, even when the local row is unowned.
      if (error instanceof ApiError && error.code === 'customer_already_exists') {
        throw new PaddleOwnershipConflictError();
      }
      throw error;
    }
    return customer.id;
  }

  async createTransaction(input: { customerId: string; priceId: string; quantity: number; appUserId: string }): Promise<string> {
    const paddle = this.client();
    const transaction = await paddle.transactions.create({
      customerId: input.customerId,
      items: [{ priceId: input.priceId, quantity: input.quantity }],
      customData: { appUserId: input.appUserId },
    });
    return transaction.id;
  }

  private client() {
    const paddle = getPaddleClient();
    if (!paddle) throw new PaddleNotConfiguredError('Checkout is temporarily unavailable');
    return paddle;
  }
}
