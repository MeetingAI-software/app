import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../../config/env';
import { drizzle } from 'drizzle-orm/postgres-js';

async function runMigrate() {
  console.log('⏳ Running migrations...');
  const start = Date.now();
  
  // prepare: false for the same reason as the app client — the migrator wraps each migration in a
  // transaction, which the Supabase transaction pooler can silently discard. See client.ts.
  const migrationClient = postgres(config.DATABASE_URL, { max: 1, prepare: false });
  
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: 'drizzle' });
    console.log(`✅ Migrations completed in ${Date.now() - start}ms`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrate();
