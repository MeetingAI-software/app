import * as Sentry from '@sentry/node';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { BotProviderError, BOT_PROVIDER_MESSAGE, isSafeRequestId } from '../../domain/errors';

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
    beforeSend: (event, hint) => hint.originalException instanceof BotProviderError
      ? sanitizeBotProviderEvent(event, hint.originalException) : event,
  });
  enabled = true;
  logger.info('Observability: Sentry initialised');
}

/** Drop SDK-added HTTP breadcrumbs/request context as well as exception details for bot errors. */
export function sanitizeBotProviderEvent(event: Sentry.ErrorEvent, error: BotProviderError): Sentry.ErrorEvent {
  const safe = new BotProviderError(error.diagnostics).diagnostics;
  return {
    type: undefined,
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform, level: 'error',
    environment: event.environment, release: event.release,
    exception: { values: [{ type: 'BotProviderError', value: BOT_PROVIDER_MESSAGE }] },
    tags: {
      ...(safe.operation ? { operation: safe.operation } : {}),
      ...(safe.status ? { status: String(safe.status) } : {}),
      ...(safe.requestId ? { providerRequestId: safe.requestId } : {}),
      ...(isSafeRequestId(event.tags?.requestId) ? { requestId: event.tags.requestId } : {}),
    },
  };
}

/** Report an error with optional string tags (meetingId / userId / …). Safe no-op when disabled. */
export function captureError(err: unknown, ctx?: Record<string, string>): void {
  if (!enabled) return;
  Sentry.captureException(err, ctx ? { tags: ctx } : undefined);
}
