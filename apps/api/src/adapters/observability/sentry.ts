import * as Sentry from '@sentry/node';
import { config } from '../../config/env';
import { logger } from '../../config/logger';

// Day 6 §5: the ONLY file that imports @sentry/node. App code depends on the two functions below,
// never on the vendor directly (SOLID-D), so swapping monitoring providers is a one-file change.
let enabled = false;

/** Initialise error monitoring once at boot. A no-op when SENTRY_DSN is unset, so dev stays clean. */
export function initObservability(): void {
  if (!config.SENTRY_DSN) {
    logger.info('Observability: SENTRY_DSN unset — error monitoring disabled');
    return;
  }
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0, // errors only today; no performance tracing
  });
  enabled = true;
  logger.info('Observability: Sentry initialised');
}

/** Report an error with optional string tags (meetingId / userId / …). Safe no-op when disabled. */
export function captureError(err: unknown, ctx?: Record<string, string>): void {
  if (!enabled) return;
  Sentry.captureException(err, ctx ? { tags: ctx } : undefined);
}
