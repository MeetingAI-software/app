import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  CapExceededError,
  BotProviderError,
  InvalidTransitionError,
  DocumentGenerationError,
  MeetingNotReadyError,
} from '../../../domain/errors';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const reqId = req.headers['x-request-id'];

  if (err instanceof CapExceededError) {
    return res.status(429).json({
      error: {
        code: 'CAP_EXCEEDED',
        message: err.message,
      },
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
    return res.status(502).json({
      error: {
        code: 'DOCUMENT_GENERATION_ERROR',
        message: err.message,
      },
    });
  }

  if (err instanceof InvalidTransitionError) {
    console.error(`[RequestId: ${reqId}] Invalid Transition Error:`, err);
    return res.status(500).json({
      error: {
        code: 'INVALID_TRANSITION',
        message: err.message,
      },
    });
  }

  console.error(`[RequestId: ${reqId}] Internal Server Error:`, err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}


