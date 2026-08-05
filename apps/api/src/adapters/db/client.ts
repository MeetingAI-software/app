import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../../config/env';
import * as schema from './schema';

// Supabase's pooler cannot run prepared statements in transaction mode (:6543), and postgres-js
// sends them by default — a multi-statement transaction then returns success, and even returns
// RETURNING rows, while its writes are silently discarded (supabase/supabase#43753). That cost us
// a one-in-six failure rate on email verification, the only feature here using a transaction.
// Left on unconditionally so the app stays correct whichever pooler port DATABASE_URL points at.
const client = postgres(config.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
