import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireAdmin } from './require-admin';
import { config } from '../../../config/env';
import type { Request, Response } from 'express';

vi.mock('../../../config/env', () => {
  return {
    config: {
      ADMIN_API_KEY: undefined,
    },
  };
});

describe('requireAdmin middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: any;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call next() if ADMIN_API_KEY is not configured', () => {
    config.ADMIN_API_KEY = undefined;
    requireAdmin(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 if ADMIN_API_KEY is configured but Authorization header is missing', () => {
    config.ADMIN_API_KEY = 'secret-key';
    requireAdmin(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'unauthorized' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if Authorization header is not a Bearer token', () => {
    config.ADMIN_API_KEY = 'secret-key';
    req.headers!.authorization = 'Basic dXNlcjpwYXNz';
    requireAdmin(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if Bearer token does not match config.ADMIN_API_KEY', () => {
    config.ADMIN_API_KEY = 'secret-key';
    req.headers!.authorization = 'Bearer wrong-key';
    requireAdmin(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if Bearer token matches config.ADMIN_API_KEY', () => {
    config.ADMIN_API_KEY = 'secret-key';
    req.headers!.authorization = 'Bearer secret-key';
    requireAdmin(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
