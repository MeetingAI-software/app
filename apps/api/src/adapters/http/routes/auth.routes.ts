import { Router } from 'express';
import { z } from 'zod';
import type { AuthService, AuthServiceApi } from '../../../application/auth.service';
import {
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  matchesOAuthState,
  setDeletionGrantCookie,
  clearDeletionGrantCookie,
  readDeletionGrantCookie,
} from '../cookies';
import { fixedWindowLimiter } from '../middleware/rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../../../config/env';
import type { User } from '../../../domain/types';
import { DELETION_STATE_PREFIX, type DeletionAuthorizationService } from '../../../application/deletion-authorization.service';
import type { GoogleOAuthStateService } from '../../../application/google-oauth-state.service';
import type { LoginAdmissionService } from '../../../application/login-admission.service';
import {
  DeletionReauthenticationRequiredError, GoogleAccountLinkRequiredError, GoogleLinkRejectedError,
} from '../../../domain/errors';

function authUserResponse(user: User) {
  const { authVersion: _authVersion, ...publicUser } = user as User & { authVersion?: number };
  return { user: publicUser, emailVerificationRequired: !user.emailVerified };
}

export function hasVerifiedGoogleEmail(payload: {
  email?: string;
  sub?: string;
  email_verified?: boolean;
} | null | undefined): payload is { email: string; sub: string; email_verified: true } {
  return Boolean(payload?.email && payload.sub && payload.email_verified === true);
}

export function createAuthRoutes(auth: AuthService & AuthServiceApi,
  deletion?: DeletionAuthorizationService, oauthStates?: GoogleOAuthStateService,
  loginAdmission?: LoginAdmissionService): Router {
  const router = Router();

  const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(10), // §2 policy: length ≥ 10
    organizationName: z.string().trim().min(2).max(120),
    businessUseConfirmed: z.literal(true),
    termsVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });
  // Login stays lenient on password shape so every mismatch is a uniform 401 (no length leak).
  const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const deleteSchema = z.object({ password: z.string().min(1).optional() });
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10), // §2 policy: length ≥ 10
  });
  const changeEmailSchema = z.object({
    currentPassword: z.string().min(1),
    newEmail: z.string().email(),
  });

  // Signup's identifier key is downstream from a separate per-IP ceiling. Login instead has
  // independent IP/account/global admission in the shared database before any Argon2 work.
  const authLimiter = fixedWindowLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyOf: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  });

  // Deliberately IP-only, with no email in the key. authLimiter above cannot cap signup at all:
  // its bucket includes the address, so every new email is a fresh bucket and one script could
  // create unlimited accounts — each sending a verification email and draining the daily Resend
  // quota. 5/hour covers a typo'd retry and a shared-NAT household while capping one IP at a sixth
  // of the daily send budget. Mounted before authLimiter so a walled IP never allocates a bucket.
  const signupIpLimiter = fixedWindowLimiter({
    max: 5,
    windowMs: 60 * 60 * 1000,
    keyOf: (req) => `signup:${req.ip}`,
  });

  // Authenticated account-change abuse guard: keyed on the session user (req.userId is set by
  // requireUser, which runs before these routes). Change-email used to share this bucket; it was
  // split out below because 10/15 min is only defensible for a route that sends no mail.
  const accountLimiter = fixedWindowLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyOf: (req) => `account:${req.userId ?? req.ip}`,
  });

  // Change-email mails an address the caller types, so it is a mailbomb primitive aimed at a third
  // party — the abuse that gets a sending domain blacklisted. Keyed on the account rather than the
  // IP so rotating IPs buys nothing. 3/hour: correcting a typo takes one or two tries, and one
  // compromised account then cannot reach 10% of the daily send budget.
  const changeEmailLimiter = fixedWindowLimiter({
    max: 3,
    windowMs: 60 * 60 * 1000,
    keyOf: (req) => `change-email:${req.userId ?? req.ip}`,
  });

  // Unauthenticated and it mails a third party, so this is capped harder than login. AuthService
  // additionally enforces a DB-backed per-account cooldown — this bucket includes the IP and so
  // can't stand alone.
  const resendVerificationLimiter = fixedWindowLimiter({
    max: 3,
    windowMs: 60 * 60 * 1000,
    keyOf: (req) => `resend:${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  });

  // Not about guessing the token — 256 bits of entropy already settles that. This keeps a client
  // looping on a dead link from hammering the database.
  const verifyEmailLimiter = fixedWindowLimiter({
    max: 20,
    windowMs: 15 * 60 * 1000,
    keyOf: (req) => `verify:${req.ip}`,
  });
  const loginIpLimiter = fixedWindowLimiter({
    max: 40, windowMs: 15 * 60_000, keyOf: req => `login:${req.ip}`,
  });

  const googleStartLimiter = fixedWindowLimiter({
    max: 20, windowMs: 15 * 60_000, keyOf: (req) => `google-start:${req.ip}`,
  });
  const googleCallbackLimiter = fixedWindowLimiter({
    max: 40, windowMs: 15 * 60_000, keyOf: (req) => `google-callback:${req.ip}`,
  });

  router.post('/api/auth/signup', signupIpLimiter, authLimiter, async (req, res, next) => {
    try {
      if (!config.PUBLIC_REGISTRATION_ENABLED) {
        return res.status(503).json({
          error: { code: 'REGISTRATION_DISABLED', message: 'New account registration is not available' },
        });
      }
      const { email, password, organizationName, termsVersion } = signupSchema.parse(req.body);
      if (termsVersion !== config.LEGAL_POLICIES_VERSION) {
        return res.status(409).json({
          error: { code: 'POLICY_VERSION_MISMATCH', message: 'The legal terms changed; reload and confirm the current version' },
        });
      }
      const { user, sessionToken, expiresAt } = await auth.signup(email, password, {
        organizationName,
        termsVersion,
      });
      setSessionCookie(res, sessionToken, expiresAt);
      return res.status(201).json(authUserResponse(user));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/api/auth/login', loginIpLimiter, async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      if (!loginAdmission && config.NODE_ENV === 'production') {
        return res.status(503).json({ error: { code: 'LOGIN_UNAVAILABLE', message: 'Sign in is temporarily unavailable' } });
      }
      if (loginAdmission && !await loginAdmission.admit(req.ip ?? '', email)) {
        res.setHeader('Retry-After', '900');
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } });
      }
      const release = loginAdmission?.acquireHashSlot();
      if (loginAdmission && !release) {
        res.setHeader('Retry-After', '1');
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } });
      }
      let result;
      try { result = await auth.login(email, password); }
      finally { release?.(); }
      const { user, sessionToken, expiresAt } = result;
      setSessionCookie(res, sessionToken, expiresAt);
      return res.status(200).json(authUserResponse(user));
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
      return res.status(200).json(authUserResponse(user));
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
      return res.status(200).json(authUserResponse(user));
    } catch (err) {
      return next(err);
    }
  });

  // Change email: verify current password, then swap the (unverified) email. EmailTaken → 409.
  router.post('/api/auth/change-email', changeEmailLimiter, async (req, res, next) => {
    try {
      const { currentPassword, newEmail } = changeEmailSchema.parse(req.body);
      const user = await auth.changeEmail(req.userId as string, currentPassword, newEmail);
      return res.status(200).json(authUserResponse(user));
    } catch (err) {
      return next(err);
    }
  });

  // Protected by requireUser (mounted globally), so req.userId is present. Password re-confirmed.
  router.post('/api/auth/account/deletion/google', accountLimiter, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    clearDeletionGrantCookie(res);
    try {
      if (!deletion) throw new DeletionReauthenticationRequiredError();
      const url = await deletion.start(req.userId!, readSessionCookie(req) ?? '');
      return res.json({ url });
    } catch (err) { return next(err); }
  });

  router.delete('/api/auth/account', accountLimiter, async (req, res, next) => {
    const grantToken = readDeletionGrantCookie(req) ?? '';
    clearDeletionGrantCookie(res);
    try {
      const { password } = deleteSchema.parse(req.body ?? {});
      await auth.deleteAccount(req.userId as string, password, { sessionToken: readSessionCookie(req) ?? '', grantToken });
      clearSessionCookie(res);
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  // --- Google OAuth 2.0 Routes ---
  router.get('/api/auth/google', googleStartLimiter, async (_req, res, next) => {
    try {
      if (!oauthStates || !config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
        return res.status(503).json({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'Google OAuth is unavailable.' } });
      }
      const { state, nonce } = await oauthStates.issue({ purpose: 'login' });
      setOAuthStateCookie(res, state);
      const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
      return res.redirect(client.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
        state, nonce,
      }));
    } catch (error) { return next(error); }
  });

  router.post('/api/auth/google/link', accountLimiter, googleStartLimiter, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!oauthStates || !config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
        return res.status(503).json({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'Google OAuth is unavailable.' } });
      }
      const { currentPassword } = z.object({ currentPassword: z.string().min(1) }).parse(req.body);
      const authVersion = await auth.beginGoogleLink(req.userId!, currentPassword);
      const { state, nonce } = await oauthStates.issue({
        purpose: 'link', userId: req.userId!, sessionToken: readSessionCookie(req) ?? '', authVersion,
      });
      setOAuthStateCookie(res, state);
      const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
      return res.json({ url: client.generateAuthUrl({
        access_type: 'offline', prompt: 'select_account',
        scope: ['openid', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
        state, nonce,
      }) });
    } catch (error) { return next(error); }
  });

  router.get('/api/auth/google/callback', googleCallbackLimiter, async (req, res, next) => {
    // Separate purpose before any login/link code. No account creation or session rotation here.
    if (typeof req.query.state === 'string' && req.query.state.startsWith(DELETION_STATE_PREFIX)) {
      res.setHeader('Cache-Control', 'no-store');
      clearDeletionGrantCookie(res);
      try {
        if (!deletion || typeof req.query.code !== 'string' || req.query.error) throw new DeletionReauthenticationRequiredError();
        const grant = await deletion.complete(readSessionCookie(req) ?? '', req.query.state, req.query.code);
        setDeletionGrantCookie(res, grant.token, grant.expiresAt);
        return res.redirect(`${config.WEB_ORIGIN}/settings?deletion=verified`);
      } catch {
        return res.redirect(`${config.WEB_ORIGIN}/settings?deletion=failed`);
      }
    }
    try {
      const validState = matchesOAuthState(req, req.query.state);
      clearOAuthStateCookie(res);
      if (!validState) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);
      }

      const challenge = typeof req.query.state === 'string'
        ? await oauthStates?.claim(req.query.state, readSessionCookie(req)) : null;
      if (!challenge) return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);
      const linkedUser = challenge.purpose === 'link'
        ? await auth.getUserForToken(readSessionCookie(req) ?? '') : null;
      if (challenge.purpose === 'link' && linkedUser?.id !== challenge.userId) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);
      }

      const code = req.query.code as string;
      if (!code) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_failed`);
      }
      const redirectUri = config.GOOGLE_REDIRECT_URI;
      const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, redirectUri);
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!hasVerifiedGoogleEmail(payload) || !oauthStates?.matchesNonce(challenge, payload.nonce)) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_payload_invalid`);
      }

      if (challenge.purpose === 'link') {
        await auth.completeGoogleLink(challenge.userId!, payload.sub, payload.email, challenge.authVersion!);
        return res.redirect(`${config.WEB_ORIGIN}/settings?google=linked`);
      }

      const { sessionToken, expiresAt } = await auth.loginOrCreateGoogleUser(
        payload.email,
        payload.sub,
        // Google is login/link-only until OAuth onboarding captures the same B2B/legal evidence
        // as the password signup flow. Existing Google users remain unaffected.
        false,
      );
      setSessionCookie(res, sessionToken, expiresAt);
      return res.redirect(`${config.WEB_ORIGIN}/meetings`);
    } catch (error) {
      if (error instanceof GoogleAccountLinkRequiredError) {
        return res.redirect(`${config.WEB_ORIGIN}/login?error=account_link_required`);
      }
      if (error instanceof GoogleLinkRejectedError) {
        return res.redirect(`${config.WEB_ORIGIN}/settings?google=failed`);
      }
      // OAuth library errors may embed authorization codes or provider response details.
      console.error('Google OAuth callback failed');
      return res.redirect(`${config.WEB_ORIGIN}/login?error=oauth_error`);
    }
  });

  // --- Email Verification Routes ---
  router.post('/api/auth/verify-email', verifyEmailLimiter, async (req, res, next) => {
    try {
      const { token, newPassword } = z.object({
        token: z.string().min(1), newPassword: z.string().min(10),
      }).parse(req.body);
      const user = await auth.verifyEmail(token, newPassword);
      clearSessionCookie(res);
      return res.status(200).json(authUserResponse(user));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/api/auth/resend-verification', resendVerificationLimiter, async (req, res, next) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      await auth.resendVerification(email);
      return res.status(200).json({ message: 'If an account exists, a new verification link has been sent.' });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
