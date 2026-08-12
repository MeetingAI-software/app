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
| Sessions | `SESSION_TTL_DAYS` (30 days), then deleted | sweep job | [sweep.ts:136](../apps/api/src/jobs/sweep.ts#L136) |
| Email send ledger | 30 days | sweep job | [sweep.ts:12](../apps/api/src/jobs/sweep.ts#L12) |
| Email verification tokens | 24-hour TTL, then next sweep | expiry checked on use + sweep job | [sweep.ts](../apps/api/src/jobs/sweep.ts) |
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
audioStoragePath in DB`, `Sweep deleted expired sessions`, `Sweep deleted expired email verification
tokens`, `Sweep pruned the email send ledger` — and failures are reported to Sentry. Token values and
hashes are never included in cleanup logs. Those logs are the evidence that the schedule executes.

## Account deletion

`AuthService.deleteAccount` erases everything for a user: stored audio, the provider-side recording,
chat, documents, transcripts, usage rows, meetings, then the user. Storage and provider failures are
logged and the erasure continues rather than aborting half-done — a stranded audio object is a
smaller harm than a user who cannot delete their account.

One deliberate exception: `email_send_ledger.user_id` is set to `NULL` rather than deleted
([schema.ts:130](../apps/api/src/adapters/db/schema.ts#L130)). The send still happened and the
anti-abuse budget still needs to count it; once detached from the user it is no longer personal data.

## External verification still required

In-room recording is disabled by default. Production startup accepts enablement only with the exact
AssemblyAI EU API origin and complete AssemblyAI/Supabase configuration. An endpoint check cannot
prove account provisioning, deployed dashboard settings, provider retention, or contractual terms;
those facts remain explicit Live checks in the [data processor map](data-processors.md).

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
