# Data retention

GDPR sets no fixed retention periods. Article 5(1)(e) — storage limitation — requires that personal
data is kept in identifiable form no longer than necessary, and Article 5(2) puts the burden on us to
*demonstrate* it. In practice that means three things: documented periods, a deletion schedule that
actually executes, and evidence it ran. This file is the first; the sweep job is the second; the
logs cited below are the third.

Every period here is our own decision, not a statutory minimum.

## Schedule

| Data | Kept for | Enforced by | Code |
|---|---|---|---|
| Meeting audio (Supabase Storage) | 1 hour after transcription | sweep job | [sweep.ts:52-62](../apps/api/src/jobs/sweep.ts#L52-L62) |
| Provider-side recording (Recall) | same pass as the audio above | sweep job | [sweep.ts:65-69](../apps/api/src/jobs/sweep.ts#L65-L69) |
| Live transcript segments | until the final transcript lands | pipeline | [process-webhook-event.service.ts:102](../apps/api/src/application/process-webhook-event.service.ts#L102) |
| Sessions | `SESSION_TTL_DAYS` (30 days), then deleted | sweep job | [sweep.ts:137](../apps/api/src/jobs/sweep.ts#L137) |
| Email send ledger | 30 days | sweep job | [sweep.ts:12](../apps/api/src/jobs/sweep.ts#L12) |
| Email verification tokens | 24-hour TTL, then deleted | sweep job | [sweep.ts:161](../apps/api/src/jobs/sweep.ts#L161) |
| Transcripts, documents, chat, usage | until the account is deleted | user-triggered erasure | [auth.service.ts:236-264](../apps/api/src/application/auth.service.ts#L236-L264) |

### Why audio goes first

The transcript is the source of truth from the moment it exists. Audio is a biometric-adjacent
recording of identifiable people who did not all individually consent to us holding it, and it is the
single highest-risk object in the system. Keeping it past the point of usefulness buys nothing and
risks everything, so it is deleted on both recording paths — bot-joined and in-room.

### Why the other periods are what they are

- **Sessions (30 days)** — matches the cookie lifetime. Dead credentials should not outlive their
  usefulness even hashed.
- **Email send ledger (30 days)** — long enough to investigate an abuse incident and sanity-check
  volume against the provider's monthly cap. The budget itself only ever reads the last 24 hours, so
  the extra 29 days exist purely for incident forensics.
- **Verification tokens (24 hours)** — a login-adjacent secret; short by design.

## How deletion actually runs

[`SweepJob`](../apps/api/src/jobs/sweep.ts) runs **once on boot and every 6 hours after**, in the API
process on Railway.

The 6-hour interval means "1 hour" is a *threshold, not a guarantee*: audio becomes eligible one hour
after transcription and is deleted at the next pass, so real-world lifetime is between 1 and roughly
7 hours. Stating the threshold as though it were the deletion time would be the kind of claim we
could not evidence.

Every pass logs its counts — `Sweep found old transcribed meetings`, `Cleared meeting
audioStoragePath in DB`, `Sweep deleted expired sessions`, `Sweep pruned the email send ledger`,
`Sweep deleted expired verification tokens` — and failures are reported to Sentry. Those logs are the
evidence that the schedule executes.

## Account deletion

`AuthService.deleteAccount` erases everything for a user: stored audio, the provider-side recording,
chat, documents, transcripts, usage rows, meetings, then the user. Storage and provider failures are
logged and the erasure continues rather than aborting half-done — a stranded audio object is a
smaller harm than a user who cannot delete their account.

One deliberate exception: `email_send_ledger.user_id` is set to `NULL` rather than deleted
([schema.ts:130](../apps/api/src/adapters/db/schema.ts#L130)). The send still happened and the
anti-abuse budget still needs to count it; once detached from the user it is no longer personal data.

## Known gaps

- **AssemblyAI region.** The endpoint is a config switch — `ASSEMBLYAI_BASE_URL` — not a code change,
  but it only achieves EU processing with an EU-provisioned account and key. Until those are confirmed
  on our plan, in-room audio may be transcribed outside the EU. Tracked in the README.

## Development environments

Production data is not copied into development. The local stack runs a throwaway Postgres container
with fabricated seed data, and the API refuses to start against a remote database from a terminal —
see [local development](local-development.md). This is deliberate compliance work, not just tidiness:
copying production personal data into a development environment repurposes it beyond what users
agreed to, which is why supervisory authorities advise against it
([CNIL developer guide](https://lincnil.github.io/GDPR-Developer-Guide/), Sheet n°11;
[AEPD on pre-production environments](https://www.aepd.es/en/prensa-y-comunicacion/blog/data-breaches-development-and-pre-production-enviroments)).

A laptop running the sweep against production is the same failure in reverse: not compliance, but
uncontrolled deletion of live data by an unmanaged device. That happened on 2026-08-08 and cost seven
meetings' audio, which is what the boot guard now prevents.
