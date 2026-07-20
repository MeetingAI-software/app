import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../../config/env';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // If ADMIN_API_KEY is not configured (e.g., in dev/test), bypass checks
  if (!config.ADMIN_API_KEY) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'unauthorized' } });
  }

  const token = authHeader.slice(7);
  const key = config.ADMIN_API_KEY;

  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(key);

  if (tokenBuf.length !== keyBuf.length) {
    return res.status(401).json({ error: { code: 'unauthorized' } });
  }

  if (!crypto.timingSafeEqual(tokenBuf, keyBuf)) {
    return res.status(401).json({ error: { code: 'unauthorized' } });
  }

  return next();
}
