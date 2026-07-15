import express from 'express';
import pinoHttp from 'pino-http';
import { requestIdMiddleware } from './middleware/request-id';
import { errorHandler } from './middleware/error-handler';

export function createServer(routes: express.Router[]): express.Application {
  const app = express();

  // Logging & Request ID
  app.use(requestIdMiddleware);
  app.use(pinoHttp({
    customAttributeKeys: {
      reqId: 'x-request-id'
    }
  }));

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
