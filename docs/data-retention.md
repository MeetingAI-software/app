# Data retention and erasure boundaries

**Engineering inventory for review, updated 2026-09-11. Periods below describe code or proposed
policy; they are not proof of production execution or approved legal retention.**

Storage limitation requires a necessary, justified period and evidence that deletion occurs.
A log statement in source is not evidence that the deployed job ran. See the
[provider inventory](data-processors.md) for external records and [handoff](launch-handoff.md) for owners.

| Data | Implemented lifetime/control after PR75 | Limits and open work |
|---|---|---|
| Transcribed meeting audio and Recall recordings | Eligible after one hour; sweep runs at boot and every six hours | Actual deletion can take longer during outages or provider failures; no guaranteed seven-hour maximum |
| Failed meetings with an audioStoragePath | Eligible after one hour, swept with per-meeting failure isolation | Does not discover objects lacking a DB reference; orphan reconciliation remains open |
| Live transcript segments | Removed when the authoritative final transcript is persisted; cascaded with meeting deletion | Failed pipelines can retain segments; assess their retention |
| Sessions | SESSION_TTL_DAYS, default 30 days; expiry checked on use and expired rows swept | Availability/cleanup delays can retain expired hashes longer |
| Google deletion authorizations | Challenge usable at most 10 minutes; grant at most 5 minutes and no longer than session | Hash-only, one row per session; replaced on restart of flow and cascaded when session/user removed |
| Email verification tokens | 24-hour use expiry, then next successful sweep | Expiry and physical deletion are different |
| Email send ledger | 30-day sweep threshold | Account erasure nulls userId; timestamps/other correlation may remain identifying |
| Transcripts, rawPayload, documents, chat, usage and meetings | Local account-erasure path | No per-item retention/export/participant-erasure system; rawPayload minimization remains open |
| Processed webhook payloads | Replaced with a marker after successful processing | Failed/unprocessed events retain payloads; dedicated retention and erasure still needed |
| Paddle customer mirror | Email/userId cleared and anonymizedAt set; later upserts cannot restore a marked identity | Provider IDs/subscription records remain linkable at Paddle; historical unmarked null rows require reconciliation |
| Waitlist | No implemented retention/deletion/unsubscribe schedule | Must define and implement a justified period and rights path |
| Platform backups, logs, provider copies | Not verified | Confirm retention, access, restore handling, deletion and contract obligations per service |

The code controls are [sweep](../apps/api/src/jobs/sweep.ts),
[account service](../apps/api/src/application/auth.service.ts),
[deletion authorization](google-account-deletion.md), [upload lifecycle](upload-limits.md) and
[billing anonymization](billing-anonymization.md). Relative references to PR75 documents become
available in the prescribed security→docs merge order.

## Account deletion

Password accounts verify their current password. Google-only accounts complete a newly verified,
session-bound Google OIDC round and then confirm separately in Settings. The grant is consumed
atomically before deletion starts; provider failure requires new authorization on retry.

Storage and Recall deletion must succeed before local content/account rows are removed. A failed
provider call keeps those local references and blocks account deletion; partial remote deletion can
already have occurred. Subsequent local DB failure can also leave a partially completed erasure.
Record the outcome and investigate rather than claiming an all-or-nothing global deletion.

The path removes owned meetings and their local transcript/document/chat/usage rows, clears billing
identity, and removes sessions/user. It does not implement a complete DSR system. It does not establish
erasure of waitlist entries, failed webhook payloads, provider statutory records, logs or backups.
Removing a direct identifier is not automatically anonymization under GDPR.

## Operational evidence and recovery

Before release, obtain a restorable backup and record the actual migration ledger. A backup restore
can reintroduce records already erased; operations must reconcile completed erasure requests before
restored data is served. Do not restore or delete production data from a developer terminal.

For each cleanup pass record timestamp, deployed commit, aggregate outcome and sanitized failure
references in an access-controlled operations record. Confirm provider behavior independently.
Tests use synthetic data in isolated databases; no production data is copied to test environments.

The source includes a remote-database boot guard for local development. That guard does not prove
all deployments are configured correctly or eliminate the need for access control and evidence.

Source: [GDPR storage limitation and accountability](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).
