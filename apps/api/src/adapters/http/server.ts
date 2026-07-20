import express from 'express';
import pinoHttp from 'pino-http';
import { requestIdMiddleware } from './middleware/request-id';
import { errorHandler } from './middleware/error-handler';
import { requireAdmin } from './middleware/require-admin';
import { config } from '../../config/env';

export function createServer(routes: express.Router[]): express.Application {
  const app = express();

  // Logging & Request ID
  app.use(requestIdMiddleware);
  app.use(pinoHttp({
    customAttributeKeys: {
      reqId: 'x-request-id'
    }
  }));

  // CORS Middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigin = config.WEB_ORIGIN;
    if (origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Protect /api/* endpoints EXCEPT GET /api/share/:token
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' && req.path.startsWith('/share/')) {
      return next();
    }
    requireAdmin(req, res, next);
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
