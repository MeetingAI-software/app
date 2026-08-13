import type { PaddleCheckoutPort } from '../../ports/paddle-checkout.port';
import { PaddleNotConfiguredError } from '../../domain/errors';
import { getPaddleClient } from './paddle-client';

export class PaddleCheckoutAdapter implements PaddleCheckoutPort {
  async createCustomer(email: string, appUserId: string): Promise<string> {
    const paddle = this.client();
    const customer = await paddle.customers.create({ email, customData: { appUserId } });
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
