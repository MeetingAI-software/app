import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { requestIdMiddleware } from './middleware/request-id';
import { errorHandler } from './middleware/error-handler';
import { requireUser } from './middleware/require-user';
import { requireVerifiedEmail } from './middleware/require-verified-email';
import { originCheck } from './middleware/origin-check';
import type { User } from '../../domain/types';
import { config } from '../../config/env';

// /api endpoints that must work WITHOUT a session. Paths here are relative to the '/api' mount.
function isPublicApi(method: string, path: string): boolean {
  if (method === 'GET' && path.startsWith('/share/')) return true; // public share pages
  if (method === 'POST' && (path === '/auth/signup' || path === '/auth/login' || path === '/auth/logout' || path === '/auth/verify-email' || path === '/auth/resend-verification')) return true;
  if (method === 'GET' && (path === '/auth/me' || path === '/auth/google' || path.startsWith('/auth/google/'))) return true;
  return false;
}

/**
 * The only authenticated endpoints an unverified account may reach. Everything else under /api is
 * gated, so a route added later is protected by default rather than by remembering the middleware.
 *
 * These three exist so nobody gets trapped: a mistyped address has to be fixable, and an account
 * you can't verify has to be one you can still leave. Paths are relative to the '/api' mount.
 */
function isVerificationExempt(method: string, path: string): boolean {
  if (method === 'POST' && (path === '/auth/change-email' || path === '/auth/change-password')) return true;
  if (method === 'DELETE' && path === '/auth/account') return true;
  return false;
}

export function createServer(
  routes: express.Router[],
  authenticate: (sessionToken: string) => Promise<User | null>
): express.Application {
  const app = express();

  // Railway terminates TLS at its edge and forwards over HTTP, so without this every request looks
  // like it came from the proxy. The rate limiters key on req.ip — the login limiter in particular
  // ("${req.ip}:${email}") would otherwise put every client on the planet in one shared bucket.
  //
  // Two hops, not one: Railway's edge and its internal router each add an entry, so a request
  // arrives as "<client>, <railway-internal>". Trusting one hop stops a step short and hands back
  // the internal address — which rotates between requests, so every IP-keyed limit silently reset
  // its own bucket and never fired. Safe to count hops here because the edge overwrites any
  // client-supplied X-Forwarded-For rather than appending to it, so the chain is always exactly
  // these two and a forged header cannot shift which entry this picks.
  app.set('trust proxy', 2);

  // Day 6 §1: security headers on every response (healthz + webhooks included). Helmet defaults
  // give us HSTS, X-Content-Type-Options: nosniff, and frame-blocking. We only override CORP:
  // this is a JSON API deliberately read cross-origin by the web app (dev :3001→:3000, prod
  // app.→api.), and the default `same-origin` would block those reads. CORS still governs access.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Logging & Request ID
  app.use(requestIdMiddleware);
  app.use(pinoHttp({
    customAttributeKeys: {
      reqId: 'x-request-id'
    }
  }));

  // CORS — echo the allowed origin and allow credentials so the session cookie can flow.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin === config.WEB_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Retry-After is not a CORS-safelisted response header, so without this the limiter's backoff
    // hint is set on the wire but invisible to the browser — decoration, not a signal.
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // §2/§7 CSRF: reject mutating /api requests whose Origin isn't our web app — before auth runs.
  app.use('/api', originCheck);

  // Replace the Day 4 shared-key gate with real per-user auth (public endpoints exempted).
  app.use('/api', (req, res, next) => {
    if (isPublicApi(req.method, req.path)) return next();
    return requireUser(authenticate)(req, res, next);
  });

  // An unverified address gets a session, but the session unlocks nothing except the verification
  // flow itself — that's what makes an in-app resend and typo fix possible instead of a dead end at
  // the login screen. OWASP: don't activate accounts before verification completes.
  app.use('/api', (req, res, next) => {
    if (isPublicApi(req.method, req.path)) return next();
    if (isVerificationExempt(req.method, req.path)) return next();
    return requireVerifiedEmail(req, res, next);
  });

  // Capture raw body for signature verification while parsing JSON
  app.use(
    express.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Mount routes
  routes.forEach(route => {
    app.use(route);
  });

  // Error Handler
  app.use(errorHandler);

  return app;
}
