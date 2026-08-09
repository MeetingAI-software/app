import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../../config/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { blocksInteractiveRemoteDatabase } from './remote-database-guard';

async function runMigrate() {
  if (blocksInteractiveRemoteDatabase(config.DATABASE_URL, Boolean(process.stdout.isTTY), process.env.ALLOW_PRODUCTION_MIGRATION)) {
    console.error('❌ Refusing to migrate a remote database from an interactive shell.');
    console.error('   Migrations run automatically on every merge to main — see the deploy job in');
    console.error('   .github/workflows/ci.yml. Local .env points at the production project.');
    console.error('   If you really mean to migrate it by hand:');
    console.error('     ALLOW_PRODUCTION_MIGRATION=yes npm run db:migrate -w api');
    process.exit(1);
  }

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
