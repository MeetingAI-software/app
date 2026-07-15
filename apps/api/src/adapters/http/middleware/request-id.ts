import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqId = (req.header('x-request-id') || uuidv4()) as string;
  req.headers['x-request-id'] = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}
