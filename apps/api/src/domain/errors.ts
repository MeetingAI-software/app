// domain/errors.ts
export class CapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapExceededError';
  }
}

export class PlanUpgradeRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanUpgradeRequiredError';
  }
}

export class FeatureUnavailableError extends Error {
  constructor(message = 'This feature is temporarily unavailable') {
    super(message);
    this.name = 'FeatureUnavailableError';
  }
}

export class PaddleCustomerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleCustomerNotFoundError';
  }
}

export class PaddleNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleNotConfiguredError';
  }
}

export class BillingMutationsDisabledError extends Error {
  constructor(message = 'Billing changes are temporarily unavailable. Existing subscriptions can still be managed in Settings.') {
    super(message);
    this.name = 'BillingMutationsDisabledError';
  }
}

export class InvalidBillingPriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBillingPriceError';
  }
}

export class InvalidBillingQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBillingQuantityError';
  }
}

export class SubscriptionAlreadyActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionAlreadyActiveError';
  }
}

export class SubscriptionPaymentDeclinedError extends Error {
  constructor(message = 'Payment was declined. Your subscription remains on the current plan.') {
    super(message);
    this.name = 'SubscriptionPaymentDeclinedError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

export const BOT_PROVIDER_MESSAGE = 'Meeting bot provider is temporarily unavailable; please try again later';
const BOT_OPERATIONS = ['create_bot', 'retrieve_bot', 'get_bot_status', 'fetch_transcript', 'download_transcript', 'delete_recording'] as const;
export type BotOperation = typeof BOT_OPERATIONS[number];
export interface BotProviderDiagnostics { operation?: BotOperation; status?: number; requestId?: string }
export const isSafeRequestId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export class BotProviderError extends Error {
  readonly diagnostics: BotProviderDiagnostics;
  constructor(input?: string | BotProviderDiagnostics) {
    // Old callers may still supply a message. Never retain raw provider text or causes.
    super(BOT_PROVIDER_MESSAGE);
    this.name = 'BotProviderError';
    const safe = typeof input === 'object' && input ? input : {};
    this.diagnostics = {
      ...(safe.operation && BOT_OPERATIONS.includes(safe.operation) ? { operation: safe.operation } : {}),
      ...(Number.isInteger(safe.status) && safe.status! >= 100 && safe.status! <= 599 ? { status: safe.status } : {}),
      ...(isSafeRequestId(safe.requestId) ? { requestId: safe.requestId } : {}),
    };
  }
}

export class DocumentGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentGenerationError';
  }
}

/**
 * The chat model itself failed us — timed out, was overloaded, or returned nothing usable.
 * Not the customer's fault and not a bug in our code, so it earns an honest message instead of
 * collapsing into the catch-all 500's "An unexpected error occurred". Retrying is the fix, which
 * is exactly what the default message tells the customer to do.
 */
export class ChatProviderError extends Error {
  constructor(message = 'The AI is busy right now. Please try again in a moment.') {
    super(message);
    this.name = 'ChatProviderError';
  }
}

export class MeetingNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeetingNotReadyError';
  }
}

// Day 5: auth
export class InvalidCredentialsError extends Error {   // → HTTP 401
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

/** Account erasure stopped before local records were removed because a required delete failed. */
export class DeletionReauthenticationRequiredError extends Error {
  constructor() {
    super('Verify your Google account again before deleting this account');
    this.name = 'DeletionReauthenticationRequiredError';
  }
}

export class AccountDeletionBlockedError extends Error {
  constructor(message = 'Account deletion could not be completed safely; please try again later') {
    super(message);
    this.name = 'AccountDeletionBlockedError';
  }
}

export class EmailTakenError extends Error {            // → HTTP 409
  constructor(message: string) {
    super(message);
    this.name = 'EmailTakenError';
  }
}

export class WeakPasswordError extends Error {          // → HTTP 400
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class InvalidVerificationTokenError extends Error {
  constructor(message = 'Verification token is invalid') {
    super(message);
    this.name = 'InvalidVerificationTokenError';
  }
}

export class ExpiredVerificationTokenError extends Error {
  constructor(message = 'Verification token has expired') {
    super(message);
    this.name = 'ExpiredVerificationTokenError';
  }
}

export class UsedVerificationTokenError extends Error {
  constructor(message = 'Verification token has already been used') {
    super(message);
    this.name = 'UsedVerificationTokenError';
  }
}

export class EmailAlreadyVerifiedError extends Error {
  constructor(message = 'Email address is already verified') {
    super(message);
    this.name = 'EmailAlreadyVerifiedError';
  }
}

/**
 * The consume-and-verify transaction reported success but the row is still unverified — the write
 * was lost between us and the database. Retryable on purpose: a discarded transaction leaves the
 * token unconsumed too, so the same link still works on the next click.
 */
export class VerificationNotPersistedError extends Error {
  constructor(message = 'Verification could not be completed, please try the link again') {
    super(message);
    this.name = 'VerificationNotPersistedError';
  }
}

/**
 * The global daily verification-email budget is spent, so no further mail goes out until the
 * rolling window frees up. A deliberate stop well below Resend's hard cap, not a fault: the
 * request was valid and retrying later is the fix.
 */
export class EmailSendBudgetExhaustedError extends Error {
  constructor(message = 'Verification emails are temporarily unavailable, please try again later') {
    super(message);
    this.name = 'EmailSendBudgetExhaustedError';
  }
}


