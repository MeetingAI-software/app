import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { isSafeRequestId } from '../../../domain/errors';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header('x-request-id');
  const reqId = isSafeRequestId(supplied) ? supplied : uuidv4();
  req.headers['x-request-id'] = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}
