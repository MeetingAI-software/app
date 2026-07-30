import type { CustomerPortalPort } from '../../ports/customer-portal.port';
import { PaddleNotConfiguredError } from '../../domain/errors';
import { getPaddleClient } from './paddle-client';

export class PaddleCustomerPortalAdapter implements CustomerPortalPort {
  async createSession(customerId: string, subscriptionIds: string[]): Promise<string> {
    const paddle = getPaddleClient();
    if (!paddle) {
      throw new PaddleNotConfiguredError('Billing management is temporarily unavailable');
    }

    const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds);
    return session.urls.general.overview;
  }
}
