import { Router } from 'express';
import { db } from '../../db/client';
import { sql } from 'drizzle-orm';

export function createHealthRoutes(): Router {
  const router = Router();

  router.get('/healthz', async (req, res) => {
    try {
      // Ping DB
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Database connection failed' });
    }
  });

  return router;
}
