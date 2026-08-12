/**
 * Test-only Postgres. PGlite is real Postgres compiled to WASM, so repository tests run genuine SQL
 * — constraints, cascades, RETURNING, transactions — in-process, with no container to start.
 *
 * Why this exists: the 12 Drizzle repositories had zero tests, because `client.ts` builds `db` from
 * a live `DATABASE_URL` at import time. Every repository imports that singleton directly, so the
 * only way to exercise one is to substitute the module. Test files do that with:
 *
 *     vi.mock('../client', () => import('../pglite-harness'));
 *
 * The factory is lazy, which is what keeps it clear of vi.mock's hoisting.
 *
 * NOT imported by any production code path — `main.ts` and the repositories only ever see
 * `./client`. It lives under src/ so it shares the repositories' relative imports and tsconfig.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

const client = new PGlite();

/** Stands in for `client.ts`'s export of the same name. */
export const db = drizzle(client, { schema });

let migrated: Promise<void> | null = null;

/**
 * Applies the real `drizzle/*.sql` files once per worker. Using the actual migrations rather than
 * `schema.ts` means a migration that drifts from the schema is a test failure, not a production
 * surprise. `migrationsFolder` is relative to cwd, which `npm test -w api` sets to apps/api — the
 * same assumption `db:migrate` already makes.
 */
export function migrateOnce(): Promise<void> {
  migrated ??= migrate(db, { migrationsFolder: 'drizzle' });
  return migrated;
}

/**
 * Empties every table but keeps the schema, so each test starts clean without paying to re-run the
 * migrations. TRUNCATE ... CASCADE because the tables are a foreign-key graph.
 */
export async function truncateAll(): Promise<void> {
  await client.exec(`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO tables
        FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations';
      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}
