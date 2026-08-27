# Record of processing activities (draft)

**Status: draft for the adviser. Not approved. Not yet the register that Article 30 requires us to
keep current — that one starts the day a controller is named.**

Article 30(1) requires the controller to keep a written record of its processing activities. The
Article 30(5) exemption for organisations under 250 people does not apply here: the processing is
not occasional, and the adviser may conclude it touches special categories (see [DPIA](dpia.md) §1).
So a register is required regardless of headcount.

This draft records what the system actually does, table by table and provider by provider, so the
register can be adopted rather than researched. Where a field depends on a decision nobody has made
yet, it says `Unassigned`; where it depends on provider evidence we do not hold, it says
`Not verified`. Neither is a formatting placeholder — each one is an open item.

## Controller

| Field | Value |
|---|---|
| Name of controller | `Unassigned` — no legal seller selected ([legal seller readiness](legal-seller-readiness.md)) |
| Contact details | `Unassigned` |
| Representative (Art. 27) | Not applicable if established in the EU; `Unassigned` otherwise |
| Data protection officer | None appointed. The Art. 37 assessment is open ([DPIA](dpia.md) §4) |
| Joint controllers (Art. 26) | **Open.** Depends on the controller/processor question in [DPIA](dpia.md) §7 |

If the adviser concludes we are a *processor* for meeting content, a second register under
Article 30(2) is required as well, listing the categories of processing carried out on behalf of
each controller. That register does not exist yet.

## A1 — Account management

| Field | Value |
|---|---|
| Purpose | Create and authenticate an account, verify the email address, keep the user signed in |
| Categories of data subject | Account holders |
| Categories of personal data | Email address, password hash, Google OAuth subject id, verification state, session token hashes and expiry, verification token hashes |
| Legal basis (draft) | Art. 6(1)(b) — necessary to provide the service the user asked for |
| Where it lives | `users`, `sessions`, `email_verification_tokens` |
| Recipients | Supabase (database hosting), Railway (API hosting), Google (OAuth sign-in), Resend (verification email) |
| Third-country transfer | `Not verified` for all four |
| Retention | Until account deletion. Sessions expire after 30 days; verification tokens are single-use and short-lived, and the sweep prunes them |
| Security measures | Password hashing; session tokens stored only as SHA-256 hashes, with the raw token existing solely in the cookie; OAuth `state` parameter; per-route rate limits; email verification required |

## A2 — Meeting recording and transcription

The core activity, and the one the DPIA is about.

| Field | Value |
|---|---|
| Purpose | Record or ingest a meeting, transcribe it with speaker labels, and make the transcript available to the account holder |
| Categories of data subject | Account holders; **meeting participants who are not our users** |
| Categories of personal data | Meeting URL, platform, timing, participant names; audio recording; speech content with speaker labels and timestamps; the raw provider transcript response; recorded seconds |
| Special categories | Not collected by design, not excluded in practice — participants say what they say. See [DPIA](dpia.md) §1 |
| Legal basis (draft) | Art. 6(1)(b) toward the account holder; Art. 6(1)(f) toward other participants, subject to the balancing test the adviser owns |
| Where it lives | `meetings`, `transcripts`, `live_transcript_segments`, `usage_ledger`, `webhook_events`; audio in Supabase Storage |
| Recipients | Recall (bot capture and diarisation), AssemblyAI (in-room transcription), Supabase, Railway |
| Third-country transfer | `Not verified`. Production refuses in-room recording enablement unless the AssemblyAI origin is the EU one, but the account region itself is a dashboard fact we cannot prove from code |
| Retention | Audio deleted 1 hour after transcription, in practice within roughly 7 hours because the sweep runs every 6. Live segments deleted when the final transcript lands. Transcripts until account deletion. See [data retention](data-retention.md) |
| Security measures | Ownership enforced in the database rather than in the route; recording-notice confirmation required before an upload is buffered (branch); processed webhook payloads redacted (branch); no production data in development |
| Open items | `transcripts.raw_payload` is a second full copy of the meeting content, kept indefinitely for reprocessing. `webhook_events` rows that never process successfully keep their payloads with no row-level retention |

## A3 — Summaries, documents and meeting chat

| Field | Value |
|---|---|
| Purpose | Generate a summary and a structured document from the transcript, and answer the account holder's questions about the meeting |
| Categories of data subject | Account holders; meeting participants, as the subjects the output is about |
| Categories of personal data | Transcript content sent as model input; generated summaries and documents describing what named people said; chat questions and answers; token counts |
| Legal basis (draft) | As A2 |
| Where it lives | `documents`, `chat_messages`, `meetings.summary` |
| Recipients | Google (Gemini), Anthropic |
| Third-country transfer | `Not verified`. Both are US-headquartered |
| Retention | Until account deletion |
| Security measures | Untrusted transcript content isolated from instructions at the prompt boundary (branch). No automated decision producing legal effects is taken |
| Note | The output is generated text about identifiable people and can be wrong. Art. 5(1)(d) accuracy applies to it |

## A4 — Sharing a meeting by link

| Field | Value |
|---|---|
| Purpose | Let an account holder give someone outside the account read access to one meeting |
| Categories of data subject | Meeting participants, as content; link recipients, as visitors |
| Categories of personal data | Share token, expiry, and everything the shared meeting contains |
| Legal basis (draft) | Art. 6(1)(b) toward the account holder; Art. 6(1)(f) toward participants |
| Where it lives | `meetings.share_token`, `share_enabled`, `share_expires_at` (branch) |
| Recipients | Anyone holding the link |
| Retention | Access ends at expiry; the underlying meeting follows A2 |
| Security measures | Sharing is off by default, time-boxed and revocable; expiry enforced in the database; the share page is `no-store` and `noindex` |
| Residual risk | A link can be forwarded. That is inherent to link sharing, and is disclosed rather than solved |

## A5 — Billing

| Field | Value |
|---|---|
| Purpose | Sell and manage the subscription |
| Categories of data subject | Paying account holders |
| Categories of personal data | Paddle customer id, billing email, subscription status, price and product ids, period boundaries, scheduled changes |
| Legal basis (draft) | Art. 6(1)(b); Art. 6(1)(c) for the statutory records Paddle keeps as merchant of record |
| Where it lives | `paddle_customers`, `paddle_subscriptions` — a mirror of Paddle state, not the source of truth |
| Recipients | Paddle |
| Third-country transfer | `Not verified` |
| Retention | Mirror rows are detached from the user on erasure: `user_id` set to null and the customer email anonymised (branch). Paddle's own statutory retention is outside our erasure and must be described in the privacy policy |
| Security measures | Webhook signature verification; no card data ever reaches us |
| Status | `BILLING_MUTATIONS_ENABLED=false`. No real payment has been taken |

## A6 — Abuse prevention for verification email

| Field | Value |
|---|---|
| Purpose | Enforce a durable daily budget on verification sends that survives restarts and rotating IPs |
| Categories of data subject | Account holders and signup attempts |
| Categories of personal data | User reference (nullable), trigger type, timestamp |
| Legal basis (draft) | Art. 6(1)(f) — preventing abuse of our own sending reputation |
| Where it lives | `email_send_ledger` |
| Retention | Pruned by the sweep. The user reference is set to null on erasure; the event itself remains |

## A7 — Waitlist

| Field | Value |
|---|---|
| Purpose | Collect an address from a visitor while the public site is gated, so they can be told at launch |
| Categories of data subject | Pre-launch visitors |
| Categories of personal data | Email address; which dialog it came from (`signin` or `upgrade`) |
| Legal basis (draft) | Art. 6(1)(a) consent |
| Where it lives | `waitlist_signups` |
| Retention | **None defined** |
| Security measures | Unique index, so a repeat submission is a no-op rather than a second row |
| Open items | No withdrawal mechanism, no deletion path, no retention period, and the address is not covered by account deletion because there is no account. Blocking before Live — see [DPIA](dpia.md) action A4 |

## A8 — Operational telemetry

| Field | Value |
|---|---|
| Purpose | Detect and diagnose errors |
| Categories of data subject | Anyone whose request produces an error |
| Categories of personal data | Error events; incidental identifiers in request context |
| Legal basis (draft) | Art. 6(1)(f) |
| Recipients | Sentry, Railway, Vercel |
| Third-country transfer | `Not verified` |
| Retention | Provider default. `Not verified` |
| Security measures | API responses and logs are redacted before leaving the process (branch) |

## Processors

Full detail, including purpose and DPA status per provider, is in the
[processor map](data-processors.md). The register-relevant state today:

| Processor | Role | DPA | Region |
|---|---|---|---|
| Railway | API hosting | `Not verified` | `Not verified` |
| Vercel | Web hosting | `Not verified` | `Not verified` |
| Supabase | Database and audio storage | `Not verified` | `Not verified` |
| Recall | Meeting bot capture | `Not verified` | `Not verified` |
| AssemblyAI | In-room transcription | `Not verified` | `Not verified` |
| Google | Gemini, OAuth | `Not verified` | `Not verified` |
| Anthropic | Document generation | `Not verified` | `Not verified` |
| Resend | Transactional email | `Not verified` | `Not verified` |
| Sentry | Error telemetry | `Not verified` | `Not verified` |
| Paddle | Merchant of record | `Not verified` | `Not verified` |

Ten of ten unverified on both counts. Article 28(3) requires a written contract with each, and
Article 30(1)(e) requires this register to name third-country transfers and their safeguards. Until
the [DPA checklist](dpa-checklist.md) is filled in, this register cannot be adopted and the privacy
policy cannot make a data-residency claim.

## General security measures (Art. 30(1)(g))

Described once here rather than repeated per activity: TLS everywhere; secrets in the platform
environment and never in the repository; fail-fast environment validation at boot; an API that
refuses to start against a remote database from a terminal; migrations that run before new code
serves traffic; deploys verified by commit SHA rather than by HTTP status; and no personal data in
the repository, in tests, or as placeholders.

## Maintenance

Article 30 requires the register to be current, not accurate once. Revisit it when a table holding
personal data is added or dropped, when a provider is added, removed or reconfigured, when a
retention period changes, and at each DPIA review. Owner: `Unassigned`.
