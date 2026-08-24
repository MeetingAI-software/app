import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  CapExceededError,
  BotProviderError,
  InvalidTransitionError,
  DocumentGenerationError,
  MeetingNotReadyError,
  InvalidCredentialsError,
  AccountDeletionBlockedError,
  EmailTakenError,
  WeakPasswordError,
  EmailAlreadyVerifiedError,
  ExpiredVerificationTokenError,
  InvalidVerificationTokenError,
  UsedVerificationTokenError,
  VerificationNotPersistedError,
  EmailSendBudgetExhaustedError,
  PlanUpgradeRequiredError,
  FeatureUnavailableError,
  PaddleCustomerNotFoundError,
  PaddleNotConfiguredError,
  BillingMutationsDisabledError,
  InvalidBillingPriceError,
  InvalidBillingQuantityError,
  SubscriptionAlreadyActiveError,
  SubscriptionPaymentDeclinedError,
} from '../../../domain/errors';
import { captureError } from '../../observability/sentry';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const reqId = req.headers['x-request-id'];

  // Day 6 §5: server-side failures (5xx) go to Sentry; 4xx are client errors and stay out of it.
  const report5xx = () =>
    captureError(err, {
      ...(typeof reqId === 'string' ? { requestId: reqId } : {}),
      ...(req.userId ? { userId: req.userId } : {}),
    });

  if (err instanceof CapExceededError) {
    return res.status(429).json({
      error: {
        code: 'CAP_EXCEEDED',
        message: err.message,
      },
    });
  }

  if (err instanceof PlanUpgradeRequiredError) {
    return res.status(403).json({
      error: {
        code: 'PLAN_UPGRADE_REQUIRED',
        message: err.message,
      },
    });
  }

  if (err instanceof FeatureUnavailableError) {
    return res.status(503).json({
      error: {
        code: 'FEATURE_UNAVAILABLE',
        message: err.message,
      },
    });
  }

  if (err instanceof PaddleCustomerNotFoundError) {
    return res.status(404).json({
      error: { code: 'PADDLE_CUSTOMER_NOT_FOUND', message: err.message },
    });
  }

  if (err instanceof PaddleNotConfiguredError) {
    return res.status(503).json({
      error: { code: 'PADDLE_NOT_CONFIGURED', message: err.message },
    });
  }

  if (err instanceof BillingMutationsDisabledError) {
    return res.status(503).json({
      error: { code: 'BILLING_MUTATIONS_DISABLED', message: err.message },
    });
  }

  if (err instanceof InvalidBillingPriceError) {
    return res.status(400).json({
      error: { code: 'INVALID_BILLING_PRICE', message: err.message },
    });
  }

  if (err instanceof InvalidBillingQuantityError) {
    return res.status(400).json({
      error: { code: 'INVALID_BILLING_QUANTITY', message: err.message },
    });
  }

  if (err instanceof SubscriptionAlreadyActiveError) {
    return res.status(409).json({
      error: { code: 'SUBSCRIPTION_ALREADY_ACTIVE', message: err.message },
    });
  }

  if (err instanceof SubscriptionPaymentDeclinedError) {
    return res.status(402).json({
      error: { code: 'SUBSCRIPTION_PAYMENT_DECLINED', message: err.message },
    });
  }

  if (err instanceof InvalidCredentialsError) {
    return res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: err.message,
      },
    });
  }

  if (err instanceof AccountDeletionBlockedError) {
    report5xx();
    return res.status(503).json({
      error: {
        code: 'ACCOUNT_DELETION_BLOCKED',
        message: err.message,
      },
    });
  }

  if (err instanceof EmailTakenError) {
    return res.status(409).json({
      error: {
        code: 'EMAIL_TAKEN',
        message: err.message,
      },
    });
  }

  if (err instanceof WeakPasswordError) {
    return res.status(400).json({
      error: {
        code: 'WEAK_PASSWORD',
        message: err.message,
      },
    });
  }

  if (err instanceof InvalidVerificationTokenError) {
    return res.status(400).json({
      error: { code: 'INVALID_VERIFICATION_TOKEN', message: err.message },
    });
  }

  if (err instanceof ExpiredVerificationTokenError) {
    return res.status(410).json({
      error: { code: 'VERIFICATION_TOKEN_EXPIRED', message: err.message },
    });
  }

  if (err instanceof UsedVerificationTokenError) {
    return res.status(409).json({
      error: { code: 'VERIFICATION_TOKEN_USED', message: err.message },
    });
  }

  if (err instanceof EmailAlreadyVerifiedError) {
    return res.status(409).json({
      error: { code: 'EMAIL_ALREADY_VERIFIED', message: err.message },
    });
  }

  // 503, not 500: the click was valid and retrying it is the fix. Reported to Sentry because a lost
  // write is an infrastructure fault, not something the user did wrong.
  if (err instanceof VerificationNotPersistedError) {
    report5xx();
    return res.status(503).json({
      error: { code: 'VERIFICATION_NOT_PERSISTED', message: err.message },
    });
  }

  // 503 rather than 429: the caller did nothing wrong and has no per-client quota to back off
  // from — the whole service is out of send budget until the rolling window frees up. Not reported
  // to Sentry; the budget service already logs the exhaustion once, and this fires per request.
  if (err instanceof EmailSendBudgetExhaustedError) {
    return res.status(503).json({
      error: { code: 'EMAIL_BUDGET_EXHAUSTED', message: err.message },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.format(),
      },
    });
  }

  if (err instanceof BotProviderError) {
    report5xx();
    return res.status(502).json({
      error: {
        code: 'BOT_PROVIDER_ERROR',
        message: err.message,
      },
    });
  }

  if (err instanceof MeetingNotReadyError) {
    return res.status(409).json({
      error: {
        code: 'MEETING_NOT_READY',
        message: err.message,
      },
    });
  }

  if (err instanceof DocumentGenerationError) {
    report5xx();
    return res.status(502).json({
      error: {
        code: 'DOCUMENT_GENERATION_ERROR',
        message: err.message,
      },
    });
  }

  if (err instanceof InvalidTransitionError) {
    console.error(`[RequestId: ${reqId}] Invalid Transition Error:`, err);
    report5xx();
    return res.status(500).json({
      error: {
        code: 'INVALID_TRANSITION',
        message: err.message,
      },
    });
  }

  console.error(`[RequestId: ${reqId}] Internal Server Error:`, err);
  report5xx();
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}


