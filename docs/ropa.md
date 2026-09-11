# Record of processing activities (draft)

**Engineering draft updated 2026-09-11. Not approved or a completed Article 30 register.**
It describes the ordered PR75 → PR76 result. Missing controller details are an evidence gap:
responsibility arises from actual purposes and means of processing, not from naming a future seller.
Pre-launch use can still process personal data. Do not infer absence of duties from no paying users.

Maintain a current record for the actual controller activities and, where applicable, a processor
record under Article 30(2). Routine service processing cannot rely simply on the under-250-person
exception: its conditions, including non-occasional processing, must be assessed.
[GDPR Article 30 (IMY full text)](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/).

## Accountability details to verify

| Field | Status |
|---|---|
| Controller identity/contact for each purpose | Not verified; owner to identify actual decision makers, including existing processing |
| Legal seller and public contact | Not verified; [seller readiness](legal-seller-readiness.md) |
| Joint-controller arrangement, if applicable | Open factual assessment, [DPIA §7](dpia.md) |
| EU representative, where required | Applicability not determined |
| DPO and contact, where required | Applicability/appointment not verified |
| Record owner and review date | Unassigned |
| Processor activities on behalf of customers | Determine categories/controllers and complete the Article 30(2) record if applicable |

## A1 — Accounts, authentication and deletion authorization

| Field | Draft record |
|---|---|
| Purpose | Account access, email verification and protection of account deletion |
| People | Account holders and signup attempts |
| Data | Email, password hash, linked Google subject, verification status, hashed session/verification tokens and expiry; deletion state/nonce/grant hashes, user/session binding, Google subject and authorization timestamps |
| Storage | users, sessions, email_verification_tokens, account_deletion_authorizations |
| Recipients | Supabase/Railway; Google for existing linked-account login/deletion identity; Resend for verification mail; web/edge request metadata as A8 |
| Proposed basis | Article 6(1)(b) for necessary account service; assess security purposes separately under the actual role/basis |
| Retention | Account rows until erasure; session default 30-day use expiry then sweep; verification tokens 24-hour use expiry then sweep. Deletion challenges at most 10 minutes, grants at most 5 minutes and no longer than session; one row per session, replaced on new flow and cascaded with session/user deletion. Expiry is not immediate physical deletion. |
| Controls | Password hashing, hashed bearer secrets, cookie/Origin controls, rate limits, email-verification boundaries; atomically consumed Google deletion grant or current password before erasure |
| Open evidence | Actual deployed session/Google settings and successful synthetic provider round; no new Google account creation in this deletion flow |

See [Google account deletion](google-account-deletion.md). A public DELETE string, email match or
account-selection prompt is not the authorization. Existing linked Google login is distinct from
email registration; the flow does not silently create or link accounts.

## A2 — Recording and transcription

| Field | Draft record |
|---|---|
| Purpose | Capture/upload and transcribe a meeting with speaker labels |
| People/data | Organizers and participants, including non-users; meeting URL, timing, names, audio, speech, provider IDs/raw responses and usage |
| Storage | meetings, transcripts including raw_payload, live_transcript_segments, usage_ledger, webhook_events; uploaded audio in Supabase Storage |
| Recipients | Recall for bot content; AssemblyAI for enabled in-room transcription; Railway/Supabase; web/edge paths as applicable |
| Proposed basis/role | Account contract alone does not establish a basis for every participant's data. Determine organizer/service roles, Article 6 basis and any Article 9/10 conditions from actual use; legitimate interests is a proposal requiring assessment, not an approved default. |
| Retention | Eligible audio/Recall cleanup after one hour, attempted by boot/six-hour sweep; no guaranteed completion maximum. Live segments removed on successful final transcript persistence or meeting deletion. Other meeting data follows account erasure; failed/raw copies have gaps below. |
| Controls | Authenticated owner-scoped queries and service/route checks; organizer notice acknowledgement recorded before recording/upload work; signed callbacks; bounded upload/SSE work |
| Limits | Notice evidence proves the organizer's acknowledgement, not participant notice/consent. Failed payloads, live pipeline failures, raw transcript retention and orphan audio require further controls. |

Special-category content can appear in speech even if speaker diarization is not biometric
identification. An EU API-origin guard is code evidence, not provider-region/contract evidence.

## A3 — Generated summaries, documents and meeting chat

| Field | Draft record |
|---|---|
| Purpose / data | Produce requested summaries/documents and transcript-grounded answers; transcript-derived prompts, output about participants, chat and token counts |
| People | Organizers and people described in content |
| Storage / recipients | documents, chat_messages, meetings.summary; Gemini or optional Anthropic according to actual provider configuration |
| Proposed basis | Depends on A2 purpose/role assessment and necessity of each generated use |
| Retention | Local output until account erasure; provider retention/training and logs Not verified |
| Controls / limits | Prompt separation of untrusted content is a mitigation, not proof against all injection. Generated assertions can be inaccurate. No verified correction/participant-rights workflow. No automated legal-effect decision is implemented by these PRs. |

## A4 — Sharing by bearer link

| Field | Draft record |
|---|---|
| Purpose / people | Organizer shares a selected completed meeting; participants as content and visitors as recipients |
| Data/storage | Share token, enabled state, expiry on meetings; intended public projection of meeting/transcript/document content |
| Recipients / basis | Anyone holding the enabled, unexpired token plus web/edge providers; assess lawful disclosure and participant interests under the actual role |
| Retention / controls | Sharing off by default; owner enable/disable/rotate, 24-hour expiry on enable, SQL expiry checks and generic noindex/no-store share metadata. Legacy links without expiry are disabled by migration. |
| Limit | Revocation cannot retrieve copies already downloaded/forwarded; expiry ends access through the link, not underlying meeting retention |

## A5 — Billing mirror

| Field | Draft record |
|---|---|
| Purpose / people / data | Subscription service for buyers; Paddle customer/provider IDs, email, subscription/product/price/status/period data |
| Storage / recipients | paddle_customers and paddle_subscriptions; Paddle handles merchant-of-record payment records separately |
| Proposed basis | Necessary local contract administration where applicable; do not borrow Paddle's statutory basis for every local copy |
| Retention / controls | Erasure nulls local email/userId and sets anonymized_at. Late upserts cannot restore a marked identity; IDs/subscription state remain. Signed webhooks and guarded mutation routes. |
| Limits | Historical unmarked null rows are not safely classified by absence alone. Provider identifiers can remain personal/linkable. Paddle's retention and rights duties are separately assessed. |
| Deployment status | Code has billing gates; actual configuration, payment history and provider records were not inspected here. A disabled gate cannot prove no earlier payments. |

[Billing anonymization boundary](billing-anonymization.md).

## A6 — Verification-email abuse prevention

Local email_send_ledger records a nullable user reference, trigger and timestamp to enforce a
durable send budget. Proposed basis: legitimate interests, subject to assessment. The sweep prunes
at a 30-day threshold; account deletion nulls the user reference. Correlation may remain possible,
so this is not an automatic anonymization conclusion. Resend's separate delivery records and
retention need provider evidence.

## A7 — Waitlist

waitlist_signups stores a visitor's email and originating dialog for launch contact. Consent is
the proposed basis; its collection, wording and withdrawal must be reviewed. No retention,
unsubscribe or erasure workflow is implemented. Account deletion cannot be assumed to cover a
person without an account. This needs action before relying on continued collection, not only
after commercial launch: [backlog](launch-handoff.md).

## A8 — Operational telemetry and web delivery

Purpose: delivery, reliability, security and error investigation. People: visitors and anyone whose
content/request may be represented. Data: request/IP/user-agent metadata, error events and incidental
identifiers. Recipients: Railway, Vercel, Cloudflare and optional Sentry, with service-specific roles.
Proposed basis: assess necessary delivery/security interests and any optional analytics separately.

Recall failures after PR75 use a stable generic error and allowlisted operation/status/UUID
diagnostics; the corresponding Sentry event discards unsafe context. Other events, historical
logs, edge/platform logging, retention and dashboard scrubbers are not proven fully sanitized.
See [Recall boundary](recall-error-boundary.md). Do not describe all API errors/logs as redacted.

## Recipients, transfers and organizational measures

The [provider role inventory](data-processors.md) is the detailed recipient record, including
Cloudflare and separate Google Gemini/OAuth purposes. Paddle is an independent controller for
its merchant buyer records; other services may combine processor and own-purpose roles. Article
28 terms apply to processor relationships, not indiscriminately to every vendor.

For each active service, complete actual processing countries, transfer mechanism/safeguards,
retention/deletion, contracts and contacts through the [evidence checklist](dpa-checklist.md).
Neither a headquarters location nor a configured API hostname proves where processing occurs.

Repository measures include ownership checks, secrets supplied through environment configuration,
startup validation, synthetic-only development data, scoped error controls and additive migration
tests. Actual TLS/access/backups/logging, migration execution and deployed commit checks still
need operational evidence. Policies and source code are not themselves that evidence.

Review this draft when data, purposes, providers, regions, retention, rights workflows or risks
change. Maintain evidence privately; publish no seller identity or agreement invented from a
placeholder.
