import { Router } from 'express';
import { z } from 'zod';
import type { AuthServiceApi } from '../../../application/auth.service';
import { setSessionCookie, clearSessionCookie, readSessionCookie } from '../cookies';
import { fixedWindowLimiter } from '../middleware/rate-limit';

export function createAuthRoutes(auth: AuthServiceApi): Router {
  const router = Router();

  const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(10), // §2 policy: length ≥ 10
  });
  // Login stays lenient on password shape so every mismatch is a uniform 401 (no length leak).
  const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const deleteSchema = z.object({ password: z.string().min(1) });

  // §2 login abuse: 10 attempts / 15 min per IP+email.
  const authLimiter = fixedWindowLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyOf: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  });

  router.post('/api/auth/signup', authLimiter, async (req, res, next) => {
    try {
      const { email, password } = signupSchema.parse(req.body);
      const { user, sessionToken, expiresAt } = await auth.signup(email, password);
      setSessionCookie(res, sessionToken, expiresAt);
      return res.status(201).json({ user });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const { user, sessionToken, expiresAt } = await auth.login(email, password);
      setSessionCookie(res, sessionToken, expiresAt);
      return res.status(200).json({ user });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = readSessionCookie(req);
      if (token) await auth.logout(token);
      clearSessionCookie(res); // idempotent: always clears, even without a live session
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  // The frontend's session probe — returns the user or 401, never redirects.
  router.get('/api/auth/me', async (req, res, next) => {
    try {
      const token = readSessionCookie(req);
      const user = token ? await auth.getUserForToken(token) : null;
      if (!user) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
      return res.status(200).json({ user });
    } catch (err) {
      return next(err);
    }
  });

  // Protected by requireUser (mounted globally), so req.userId is present. Password re-confirmed.
  router.delete('/api/auth/account', async (req, res, next) => {
    try {
      const { password } = deleteSchema.parse(req.body);
      await auth.deleteAccount(req.userId as string, password);
      clearSessionCookie(res);
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
