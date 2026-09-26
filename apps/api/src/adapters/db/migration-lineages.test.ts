import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));

describe('immutable migration lineages', () => {
  it.each(['empty', 'main-0011', 'security-0013'])('upgrades %s and can rerun without losing meeting data', async (lineage) => {
    const client = new PGlite();
    const db = drizzle(client);
    const folder = mkdtempSync(join(tmpdir(), 'syncmemos-migration-'));
    try {
      if (lineage !== 'empty') {
        const entries = lineage === 'main-0011'
          ? [...journal.entries.slice(0, 11), {
            idx: 11, version: '7', when: 1789131006383,
            tag: '0011_demonic_gwen_stacy', breakpoints: true,
          }]
          : journal.entries.slice(0, 14);
        mkdirSync(join(folder, 'meta'));
        writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
        for (const entry of entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
        await migrate(db, { migrationsFolder: folder });
        await client.exec(`
          INSERT INTO users (id,email) VALUES ('00000000-0000-4000-8000-000000000001','migration@example.test');
          INSERT INTO meetings (id,owner_user_id,meeting_url,platform,status,share_token,share_enabled)
          VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
            'https://meet.google.com/synthetic','google_meet','transcribed','historical-token',true);
        `);
      }
      await migrate(db, { migrationsFolder: 'drizzle' });
      await migrate(db, { migrationsFolder: 'drizzle' });
      const columns = await client.query<{ table_name: string; column_name: string }>(
        "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'",
      );
      const names = columns.rows.map(row => `${row.table_name}.${row.column_name}`);
      expect(names).toEqual(expect.arrayContaining([
        'meetings.share_enabled', 'meetings.share_expires_at',
        'meetings.recording_notice_confirmed_at', 'meetings.recording_notice_version',
        'users.organization_name', 'users.business_use_confirmed_at', 'users.terms_version_accepted',
        'account_deletion_authorizations.session_id', 'account_deletion_authorizations.state_hash',
        'account_deletion_authorizations.nonce_hash', 'account_deletion_authorizations.grant_hash',
        'paddle_customers.anonymized_at',
        'users.email_version', 'users.auth_version',
        'google_oauth_states.state_hash', 'google_oauth_states.nonce_hash',
        'google_oauth_states.session_hash', 'google_oauth_states.auth_version',
        'google_oauth_budget.window', 'google_oauth_budget.count',
        'login_attempt_budgets.scope', 'login_attempt_budgets.window',
        'login_attempt_budgets.count',
        'document_generation_budgets.meeting_id',
        'document_generation_budgets.attempts',
      ]));
      const indexes = await client.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename='meetings'");
      expect(indexes.rows.map(row => row.indexname)).toContain('meetings_share_expiry_idx');
      expect(indexes.rows.map(row => row.indexname)).toContain('meetings_bot_id_uq');
      if (lineage !== 'empty') {
        const meetings = await client.query('SELECT share_enabled,share_expires_at,share_token FROM meetings');
        expect(meetings.rows).toEqual([{ share_enabled: false, share_expires_at: null, share_token: 'historical-token' }]);
        expect((await client.query('SELECT email FROM users')).rows).toEqual([{ email: 'migration@example.test' }]);
      }
    } finally {
      await client.close();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 30_000);

  it('seeds one paid attempt for each document created before the budget migration', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    const folder = mkdtempSync(join(tmpdir(), 'syncmemos-document-migration-'));
    try {
      const entries = journal.entries.slice(0, 23);
      mkdirSync(join(folder, 'meta'));
      writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
      for (const entry of entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: folder });
      await client.exec(`
        INSERT INTO users (id,email) VALUES ('00000000-0000-4000-8000-000000000001','document@example.test');
        INSERT INTO meetings (id,owner_user_id,share_token,status)
        VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
          'document-migration-token','transcribed');
        INSERT INTO documents (meeting_id,content,model)
        VALUES ('00000000-0000-4000-8000-000000000002','{}'::jsonb,'historical-model');
      `);
      await migrate(db, { migrationsFolder: 'drizzle' });
      await migrate(db, { migrationsFolder: 'drizzle' });
      expect((await client.query('SELECT attempts FROM document_generation_budgets')).rows)
        .toEqual([{ attempts: 1 }]);
    } finally {
      await client.close();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses ambiguous historical bot bindings without choosing an owner', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    const folder = mkdtempSync(join(tmpdir(), 'syncmemos-bot-binding-migration-'));
    try {
      const entries = journal.entries.slice(0, 24);
      mkdirSync(join(folder, 'meta'));
      writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
      for (const entry of entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: folder });
      await client.exec(`
        INSERT INTO users (id,email) VALUES
          ('00000000-0000-4000-8000-000000000001','bot-a@example.test'),
          ('00000000-0000-4000-8000-000000000002','bot-b@example.test');
        INSERT INTO meetings (id,owner_user_id,share_token,bot_id) VALUES
          ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','bot-a-token','ambiguous-bot'),
          ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','bot-b-token','ambiguous-bot');
      `);
      await expect(migrate(db, { migrationsFolder: 'drizzle' })).rejects.toThrow();
      expect((await client.query('SELECT owner_user_id FROM meetings WHERE bot_id = $1',
        ['ambiguous-bot'])).rows).toHaveLength(2);
      expect((await client.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'meetings'"))
        .rows.map(row => row.indexname)).toContain('meetings_bot_id_idx');
    } finally {
      await client.close();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 30_000);
});
