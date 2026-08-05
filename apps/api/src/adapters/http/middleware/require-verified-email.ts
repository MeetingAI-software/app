import type { Request, Response, NextFunction } from 'express';

/**
 * Holds the two endpoints that spend real money — bot minutes, transcription, LLM calls — until the
 * address has been proven reachable. Without it a throwaway signup is worth a full
 * MONTHLY_CAP_SECONDS of processing, which is the whole reason verification exists here.
 *
 * Runs after `requireUser`, which sets `req.emailVerified`. A missing flag means the route was
 * mounted outside the auth gate, so this fails closed rather than assuming the user is verified.
 *
 * Chat and document generation are deliberately left ungated: both require a meeting, and a meeting
 * can only be created through the two routes this guards.
 */
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (req.emailVerified === true) return next();
  return res.status(403).json({
    error: {
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Verify your email address to continue',
    },
  });
}
