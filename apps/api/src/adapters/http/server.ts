import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { requestIdMiddleware } from './middleware/request-id';
import { errorHandler } from './middleware/error-handler';
import { requireUser } from './middleware/require-user';
import { originCheck } from './middleware/origin-check';
import type { User } from '../../domain/types';
import { config } from '../../config/env';

// /api endpoints that must work WITHOUT a session. Paths here are relative to the '/api' mount.
function isPublicApi(method: string, path: string): boolean {
  if (method === 'GET' && path.startsWith('/share/')) return true; // public share pages
  if (method === 'POST' && (path === '/auth/signup' || path === '/auth/login' || path === '/auth/logout')) return true;
  if (method === 'GET' && path === '/auth/me') return true; // the session probe (401s on its own)
  return false;
}

export function createServer(
  routes: express.Router[],
  authenticate: (sessionToken: string) => Promise<User | null>
): express.Application {
  const app = express();

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
