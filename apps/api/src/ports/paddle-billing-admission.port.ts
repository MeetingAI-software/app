export type PaddleBillingAdmissionResult = 'admitted' | 'rate_limited' | 'busy';

export interface PaddleBillingAdmissionRepository {
  acquire(input: {
    userId: string;
    token: string;
  }): Promise<PaddleBillingAdmissionResult>;
  release(token: string): Promise<void>;
}
