import { Router } from 'express';
import { z } from 'zod';
import type { AuthService, AuthServiceApi } from '../../../application/auth.service';
import { setSessionCookie, clearSessionCookie, readSessionCookie } from '../cookies';
import { fixedWindowLimiter } from '../middleware/rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../../../config/env';

export function createAuthRoutes(auth: AuthService & AuthServiceApi): Router {
  const router = Router();

  const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(10), // §2 policy: length ≥ 10
  });
  // Login stays lenient on password shape so every mismatch is a uniform 401 (no length leak).
  const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const deleteSchema = z.object({ password: z.string().min(1) });
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10), // §2 policy: length ≥ 10
  });
  const changeEmailSchema = z.object({
    currentPassword: z.string().min(1),
    newEmail: z.string().email(),
  });

  // §2 login abuse: 10 attempts / 15 min per IP+email.
  const authLimiter = fixedWindowLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyOf: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  });

  // Authenticated account-change abuse guard: keyed on the session user (req.userId is set by
  // requireUser, which runs before these routes).
  const accountLimiter = fixedWindowLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyOf: (req) => `account:${req.userId ?? req.ip}`,
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

  // Change password: verify current, rotate sessions, re-set the cookie so this device stays in.
  router.post('/api/auth/change-password', accountLimiter, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const { user, sessionToken, expiresAt } = await auth.changePassword(req.userId as string, currentPassword, newPassword);
      setSessionCookie(res, sessionToken, expiresAt);
      return res.status(200).json({ user });
    } catch (err) {
      return next(err);
    }
  });

  // Change email: verify current password, then swap the (unverified) email. EmailTaken → 409.
  router.post('/api/auth/change-email', accountLimiter, async (req, res, next) => {
    try {
      const { currentPassword, newEmail } = changeEmailSchema.parse(req.body);
      const user = await auth.changeEmail(req.userId as string, currentPassword, newEmail);
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

  // --- Google OAuth 2.0 Routes ---
  router.get('/api/auth/google', (req, res) => {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'Google OAuth is not configured on backend.' } });
    }
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:3000/api/auth/google/callback`;
    const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, redirectUri);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    });
    return res.redirect(url);
  });

  router.get('/api/auth/google/callback', async (req, res, next) => {
    try {
      const code = req.query.code as string;
      if (!code) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_failed`);
      }
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:3000/api/auth/google/callback`;
      const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, redirectUri);
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_payload_invalid`);
      }

      const { sessionToken, expiresAt } = await auth.loginOrCreateGoogleUser(payload.email, payload.sub);
      setSessionCookie(res, sessionToken, expiresAt);
      return res.redirect(`${config.WEB_ORIGIN}/meetings`);
    } catch (err) {
      console.error('❌ Google OAuth Callback Error:', err);
      return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_error`);
    }
  });

  return router;
}
