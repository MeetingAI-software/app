export type PlanChangeProrationMode = 'prorated_immediately' | 'prorated_next_billing_period';

export interface PaddlePlanChangePreview {
  immediateAmount: string | null;
  immediateCurrency: string | null;
  recurringAmount: string | null;
  recurringCurrency: string | null;
  nextBilledAt: string | null;
}

export interface SubscriptionUpdatePort {
  preview(input: {
    subscriptionId: string;
    priceId: string;
    quantity: number;
    prorationBillingMode: PlanChangeProrationMode;
  }): Promise<PaddlePlanChangePreview>;
  update(input: {
    subscriptionId: string;
    priceId: string;
    quantity: number;
    prorationBillingMode: PlanChangeProrationMode;
  }): Promise<{ status: string; priceId: string | null }>;
}
