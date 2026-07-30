import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import { config } from '../../config/env';

let paddle: Paddle | null = null;

export function getPaddleClient(): Paddle | null {
  // Never let a legacy sandbox key leak into the production API by fallback.
  const apiKey = config.PADDLE_ENV === 'production'
    ? config.PADDLE_API_KEY
    : (config.PADDLE_API_KEY ?? config.PADDLE_SANDBOX_API_KEY);
  if (!apiKey) return null;

  paddle ??= new Paddle(apiKey, {
    environment: config.PADDLE_ENV === 'production' ? Environment.production : Environment.sandbox,
  });
  return paddle;
}
