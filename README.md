# Syncmemos

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

## Data protection

Both recording paths make audio eligible for automatic deletion after successful processing; the
transcript is the source of truth from that point on. Exact deletion timing and the external facts
that still need verification are documented rather than presented as residency guarantees.

Every retention period, what enforces it, and the remaining external checks are documented in
[data retention](docs/data-retention.md). The provider-by-provider engineering inventory and its
outstanding Live checks are maintained in the [production data processor map](docs/data-processors.md).

In-room recording is fail-closed and disabled by default. Enabling it in production makes API
startup require AssemblyAI, the exact `https://api.eu.assemblyai.com` endpoint, a provisioned API
key and webhook secret, and complete Supabase configuration. That technical guard does not prove
the external account's region; operators must still verify the deployed values, account
provisioning, provider settings, retention, and DPA before Live.

## Launch governance

Paddle Live remains blocked until the owners complete the
[legal seller readiness gate](docs/legal-seller-readiness.md). The repository does not assume a
registered business, legal supplier, or public seller address. Customer email setup is documented
separately in the [support email runbook](docs/support-email.md), including authenticated outbound
mail and SPF, DKIM, and DMARC verification rather than inbound forwarding alone.
