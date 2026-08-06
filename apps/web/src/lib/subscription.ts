const MANAGEABLE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'paused',
]);

/**
 * A canceled subscription may remain in the API response as billing history.
 * Only show the customer portal as an active subscription action while Paddle
 * still considers the subscription manageable.
 */
export function canManageSubscription(status: string, hasSubscription: boolean): boolean {
  return hasSubscription && MANAGEABLE_SUBSCRIPTION_STATUSES.has(status);
}
