# Local development

Everything below runs against a **local** database with **fake** providers. No real user data, no
vendor spend, no emails to real people.

## Setup

```bash
docker compose up -d                    # Postgres on localhost:5432
npm ci
npm run db:migrate -w api               # create the schema
npm run db:seed -w api                  # fabricated user + 3 meetings
npm run dev -w api                      # http://localhost:3000
npm run dev -w web                      # http://localhost:3001
```

Sign in with **`dev@localhost`** / **`devpassword123`**.

The local database, Docker container/volume, and browser verification storage key intentionally keep
their historical `meetingai` identifiers. They are compatibility identifiers rather than
customer-facing branding; renaming them would discard existing local data or browser state.

Reset local data at any time — the seeder clears its own rows first, so it is safe to re-run:

```bash
npm run db:seed -w api
```

To start completely clean, including the schema:

```bash
docker compose down -v && docker compose up -d
npm run db:migrate -w api && npm run db:seed -w api
```

## What `apps/api/.env` must look like

```
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/meetingai_dev

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

BOT_PROVIDER=fake
TRANSCRIPTION_PROVIDER=fake
DOC_PROVIDER=fake
CHAT_PROVIDER=fake
EMAIL_PROVIDER=log
```

Those five providers are not a preference. `recall` creates real bots and lets the sweep delete real
recordings, `assemblyai` / `claude` / `gemini` spend real money, and `resend` **sends real email to
real people**. `fake` and `log` are the only correct local values.

Leaving the two `SUPABASE_*` values blank is deliberate rather than incomplete. They are `.optional()`
in the env schema, and `SupabaseStorageAdapter.ensureConfigured()` throws a clear *"Supabase storage
is not configured"* on use — so local upload flows fail loudly and locally instead of quietly
reaching into the live audio bucket. Uploads are the one flow you cannot exercise locally; everything
else works.

## Two guards you will meet

**The app refuses to start against a remote database.**

```
❌ Refusing to start against a remote database from an interactive shell.
```

The API process runs the sweep job on boot — which deletes meeting audio — and serves account
deletion. Pointed at production, that is not a mistake you get to notice and undo; it has already
happened. It happened once, on 2026-08-08, and cost seven meetings' audio.

The guard fires only for **a human at a terminal aimed at a non-local host**, so CI and the Railway
container are untouched by construction. Break glass with:

```bash
ALLOW_REMOTE_DB=yes npm run dev -w api
```

**The seeder refuses any non-local database, with no override at all.** It writes fabricated rows in
bulk; there is no situation where that belongs in production.

`npm run db:migrate -w api` has the same protection, overridden with `ALLOW_PRODUCTION_MIGRATION=yes`.
All three live in
[`apps/api/src/adapters/db/remote-database-guard.ts`](../apps/api/src/adapters/db/remote-database-guard.ts).

## Gotcha: `.env` beats your shell

`env.ts` calls `dotenv.config({ override: true })`, so values in `apps/api/.env` **overwrite** real
environment variables. This does not work:

```bash
DATABASE_URL=postgres://... npm run dev -w api      # ignored — .env wins
```

Edit `apps/api/.env` instead. Variables read straight from `process.env` rather than through the
config schema — `ALLOW_REMOTE_DB`, `ALLOW_PRODUCTION_MIGRATION` — are unaffected and work inline.

## Why local Postgres and not `supabase start`

The Supabase CLI would give closer parity, at ~4 GB of images and 2–4 GB of idle RAM. The schema uses
no extensions (`gen_random_uuid()` has been built in since Postgres 13), and storage is intentionally
unconfigured, so the one service actually needed is Postgres. Plain Postgres it is.

## Production data

Don't copy it here. Regulators are explicit that production personal data should not be used in
development ([CNIL developer guide](https://lincnil.github.io/GDPR-Developer-Guide/), Sheet n°11) —
and this app's production data is meeting transcripts, which is about as sensitive as it gets. The
seeder exists so there is never a reason to.

See also [data retention](data-retention.md).
