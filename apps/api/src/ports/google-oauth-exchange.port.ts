export interface GoogleOAuthExchangeRepository {
  acquire(token: string, now: Date, expiresAt: Date): Promise<boolean>;
  release(token: string): Promise<void>;
}
