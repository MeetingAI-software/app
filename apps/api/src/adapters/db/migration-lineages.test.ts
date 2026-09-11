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
      ]));
      const indexes = await client.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename='meetings'");
      expect(indexes.rows.map(row => row.indexname)).toContain('meetings_share_expiry_idx');
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
});
