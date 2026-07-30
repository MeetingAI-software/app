export interface PaddleCheckoutPort {
  createCustomer(email: string, appUserId: string): Promise<string>;
  createTransaction(input: {
    customerId: string;
    priceId: string;
    appUserId: string;
  }): Promise<string>;
}
