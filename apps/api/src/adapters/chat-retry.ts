import { logger } from '../config/logger';
import { ChatProviderError } from '../domain/errors';

/** One immediate retry, after a short pause so we are not hammering a provider that is already
 *  struggling. Long enough to clear a momentary spike, short enough that nobody notices. */
const RETRY_DELAY_MS = 400;

/**
 * Overload and rate limiting come back fast, so a second attempt is cheap and usually works.
 *
 * A timeout is deliberately NOT retryable: it already spent the whole time budget, and asking
 * again would double the wait for someone staring at a spinner. Matched on the wire status and
 * the message text together, because the two SDKs surface their failures differently — Google
 * throws an ApiError whose message is the raw JSON body, Anthropic an APIError with a `status`.
 */
export function isRetryableProviderError(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown };
  const text = `${String(e?.status ?? '')} ${String(e?.code ?? '')} ${String(e?.message ?? '')}`;
  if (/DEADLINE_EXCEEDED|\b504\b|timed? ?out/i.test(text)) return false;
  return /\b(429|500|502|503|529)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|overloaded|high demand/i.test(
    text
  );
}

/**
 * Runs a chat call, retries once if the failure looks transient, and converts whatever is left
 * into a ChatProviderError so the customer gets "the AI is busy" instead of the catch-all 500.
 * The provider's own message is logged, never returned — it is vendor noise, and occasionally
 * echoes back part of the prompt.
 */
export async function callChatProvider<T>(
  provider: string,
  call: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await call();
    } catch (err) {
      const retryable = attempt === 1 && isRetryableProviderError(err);
      logger.warn(
        {
          provider,
          attempt,
          retrying: retryable,
          providerError: (err as Error)?.message,
          operation: 'answerQuestion',
        },
        'Chat provider call failed'
      );
      if (!retryable) throw new ChatProviderError();
      await sleep(RETRY_DELAY_MS);
    }
  }
  /* c8 ignore next */
  throw new ChatProviderError(); // unreachable: the loop either returns or throws
}
