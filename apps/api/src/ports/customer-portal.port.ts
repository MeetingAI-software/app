export interface CustomerPortalPort {
  createSession(customerId: string, subscriptionIds: string[]): Promise<string>;
}
