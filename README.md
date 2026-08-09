# MeetingAI

Turns meetings into shareable documents and a grounded chat. Two recording paths feed the same
pipeline — bot-joined online meetings (Recall) and in-room recordings (browser mic → AssemblyAI) —
producing a transcript, a summary, a structured document, and a chat that answers only from the
transcript with `[mm:ss]` citations.

- `apps/api` — Node/Express API, background worker, and provider adapters (hexagonal / ports-and-adapters).
- `apps/web` — Next.js frontend.

Providers are swappable via env vars (`BOT_PROVIDER`, `DOC_PROVIDER`, `TRANSCRIPTION_PROVIDER`,
`CHAT_PROVIDER`), each with a `fake` implementation so the whole app runs end-to-end without any real
vendor or spend.

## Getting started

```bash
docker compose up -d
npm ci
npm run db:migrate -w api && npm run db:seed -w api
npm run dev -w api      # and `npm run dev -w web` in a second terminal
```

Local development runs against a throwaway Postgres container with fabricated data, never production.
The API refuses to start against a remote database from a terminal — see
[local development](docs/local-development.md) for the full setup and the guards you will meet.

## Email verification

Password signups receive a single-use, 24-hour email verification link. Delivery can use structured
local logs or real transactional email through Resend; the frontend provides verification status,
resend controls, and the `/verify-email` landing page.

See [the email verification runbook](docs/email-verification.md) for migrations, local testing, the
HTTP contract, security properties, and the production mail-delivery requirement.

## Data residency & GDPR

The EU is the data-residency baseline: the Postgres database and the Supabase Storage bucket are
created in an EU region, and **both** recording paths delete the audio once the summary succeeds —
the transcript is the source of truth from that point on.

Every retention period, what enforces it, and the known gaps are documented in
[data retention](docs/data-retention.md).

**Known gap — AssemblyAI region (verify before go-live).** In-room recordings are transcribed by
AssemblyAI. AssemblyAI offers an EU endpoint (`https://api.eu.assemblyai.com`) that requires an
EU-provisioned account and API key. The adapter defaults to the standard endpoint
(`https://api.assemblyai.com`); to keep transcription in the EU, point `AssemblyAIAdapter`'s
`baseUrl` option at the EU endpoint and use an EU key. **Until that is confirmed on our plan, audio
sent for transcription may be processed outside the EU** — a known gap in the GDPR story to close at
go-live.
