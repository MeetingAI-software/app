import { Router } from 'express';
import { db } from '../../db/client';
import { sql } from 'drizzle-orm';
import { config } from '../../../config/env';

export function createHealthRoutes(): Router {
  const router = Router();

  router.get('/healthz', async (req, res) => {
    try {
      // Ping DB
      await db.execute(sql`SELECT 1`);
      // `commit` is what lets the deploy pipeline assert the merged SHA is actually serving. The
      // old build answers 200 too, so status alone can never distinguish "deployed" from "still
      // running yesterday's code". 'unknown' outside the pipeline (local dev, tests).
      res.status(200).json({ ok: true, commit: config.GIT_COMMIT });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Database connection failed' });
    }
  });

  return router;
}
