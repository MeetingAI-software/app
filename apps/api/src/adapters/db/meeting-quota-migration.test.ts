import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('meeting quota migration on existing data', () => {
  it('claims old active meetings and consolidates duplicate usage without overcharging', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE users (id uuid PRIMARY KEY);
        CREATE TABLE meetings (id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL);
        CREATE TABLE usage_ledger (id uuid PRIMARY KEY, meeting_id uuid NOT NULL REFERENCES meetings(id),
          seconds_recorded integer NOT NULL, created_at timestamptz NOT NULL);
        INSERT INTO users VALUES ('00000000-0000-4000-8000-000000000001');
        INSERT INTO meetings VALUES
          ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'pending'),
          ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'transcribed');
        INSERT INTO usage_ledger VALUES
          ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000012', 30, '2026-08-30T00:00:00Z'),
          ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012', 45, '2026-09-01T00:00:00Z');
      `);
      const migration = readFileSync(join(process.cwd(), 'drizzle', '0022_boring_excalibur.sql'), 'utf8');
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await db.exec(statement);
      }
      const claims = await db.query<{ reserved_seconds: number; released_at: Date | null }>(
        'SELECT reserved_seconds, released_at FROM meeting_quota_reservations',
      );
      expect(claims.rows).toEqual([{ reserved_seconds: 86400, released_at: null }]);
      const usage = await db.query<{ seconds_recorded: number; created_at: Date }>(
        'SELECT seconds_recorded, created_at FROM usage_ledger',
      );
      expect(usage.rows).toHaveLength(1);
      expect(usage.rows[0].seconds_recorded).toBe(45);
      expect(new Date(usage.rows[0].created_at).toISOString()).toBe('2026-08-30T00:00:00.000Z');
      await expect(db.exec(`INSERT INTO usage_ledger VALUES
        ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000012', 45, now())`))
        .rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 15_000);
});
