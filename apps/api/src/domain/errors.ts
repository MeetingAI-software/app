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

export class BotProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotProviderError';
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


