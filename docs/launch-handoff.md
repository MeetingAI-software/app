# Controlled merge and launch handoff

**Engineering handoff updated 2026-09-11. Legal assessments and procedures remain drafts.**
This records the intended result of PR75 → PR76 → PR77. It is not approval to merge, deploy,
open registration or enable payments. Current-head checks and private release evidence must be
attached to the review; historical test totals do not certify a new commit.

## Three existing PRs, in order

| Order | Branch / PR | Scope and dependency |
|---|---|---|
| 1 | `fix/security-compliance-hardening` / [PR75](https://github.com/MeetingAI-software/app/pull/75) | Runtime security, compatible dependency patches, additive database changes and the release checklist |
| 2 | `docs/launch-readiness-pack` / [PR76](https://github.com/MeetingAI-software/app/pull/76) | Corrected privacy drafts, provider roles and this handoff; describes the PR75 implementation |
| 3 | `fix/withdrawal-copy-not-refund` / [PR77](https://github.com/MeetingAI-software/app/pull/77) | Historical launch-plan annotation; withdrawal/refund text fixes already exist in main |

All three keep main as their base. Verify their ordered merge result in a separate integration
copy. The documentation branches may inherit older main dependencies before PR75; do not copy
runtime fixes into them or treat their standalone audit as the final combined dependency state.
No replacement PR or history rewrite is needed.

Merging main can release production automatically. The Railway workflow runs API/web checks,
stamps the commit, migrates and deploys; Vercel's web deployment is independently triggered.
A green local build does not establish that these releases are coordinated. A documentation merge
can also retrigger deployment. The owner makes the merge decision after the checks below.

## Code delivered by PR75

- A session-bound Google OIDC round for Google-only account deletion, followed by a separate final
  confirmation. PostgreSQL holds challenge/grant hashes; a grant expires within five minutes and
  is consumed atomically before deletion, including a failed attempt. Password accounts still
  verify their password. See [Google deletion](google-account-deletion.md) for the precise proof
  and its distinction from forcing a new Google password entry.
- Share expiry and owner controls, generic private-safe share metadata, recording-notice evidence,
  Origin/auth/ownership boundaries, bounded upload/SSE capacity and ordered durable replay.
- Blank optional configuration normalization with conditional startup guards and range checks.
- Stable Recall errors with a deliberately narrow diagnostics/monitoring allowlist. This is not
  evidence of complete historical log redaction: [Recall boundary](recall-error-boundary.md).
- A persistent local Paddle anonymization marker preventing late upserts from restoring email or
  user linkage. Provider identifiers and necessary billing state remain:
  [billing erasure limits](billing-anonymization.md).
- Compatible dependency updates under the manual update policy. Run a fresh full and production
  audit on each final security/integration lockfile; no forced Drizzle downgrade.

## Closed-mode release prerequisites

The detailed operator checklist is [security pre-merge](security-branch-premerge.md). Each item
below requires evidence, not an assumption. Store secrets, account identifiers and provider
records privately.

1. Record the current main, three PR heads and deployment configuration. Confirm how to hold or
   coordinate Vercel and Railway releases before any merge; allow no active recordings across
   the compatibility window.
2. Obtain a verified backup and a tested restore/recovery procedure. Inspect the actual migration
   ledger read-only and match its lineage. Do not edit existing SQL 0011–0013.
3. Apply the reviewed migration order during the later authorized release: the canonical ledger
   includes the existing security 0011–0013, followed by
   `0014_reconcile_share_lineages`, `0015_google_deletion_authorization` and
   `0016_paddle_anonymization_marker`. Main's parallel
   `0011_demonic_gwen_stacy` has a later timestamp than security's 0011–0013; bridge 0014
   adds the missing columns on either lineage. Verify the real ledger against the migration
   guide; do not manually replay or renumber history.
4. Validate actual environment values without exposing them. Blank optional/default numeric values
   use absence/defaults, while required values, enabled-feature requirements and ranges still
   fail closed. Match API registration/legal gates and the web's published-policy version and
   seller inputs. Keep approved closed-mode gates closed; no Live payment inference follows
   merely from a flag or a 404 legal page.
5. Confirm the Google application, existing callback URL, HTTPS cookie/session behavior and
   same-account deletion round in an approved synthetic release check. A mocked browser round
   and local negative tests do not certify the provider dashboard.
6. Coordinate Recall workspace/region and realtime verification secret with provider configuration
   and existing bots. A legacy workspace may have different async and realtime secrets; newer
   workspaces can use one workspace secret for both. Disabling new live transcription does not
   remove callbacks from existing bots. Follow the pre-merge checklist's drain/rotation sequence.
7. Tell the operator that legacy share links without an expiry are intentionally disabled and old
   browser tabs may need reloading. Verify API and web commit identity after release, then run the
   approved closed-mode smoke: health, registration/legal/billing gates, authenticated owner
   access, revoked/expired sharing and required notice behavior. Keep CSP Report-Only.

**Rollback after migration:** leave additive schema and the migration ledger intact. Use a
previously tested compatible application revision only; an arbitrary old main can restore weaker
sharing/deletion/signature behavior. Pause affected operations or apply a forward fix if no
compatible rollback exists. A database restore is a separate operator decision accounting for
writes since backup and reapplying erasure restrictions. Test this before release.

## Evidence and remaining uncertainty

Local verification must cover clean Node20 installation, all API/web tests, both typechecks,
web lint, both production builds, full audit with no high/critical findings, production audit
with no findings, secrets/diff checks, empty/main-lineage migrations and snapshot/schema agreement.
Use synthetic negative tests for auth, ownership, sharing, webhooks, recording notice, erasure and
resource limits; mock external identity/payment/storage providers in browser smoke. Attach the
final commit-specific CI links to the PRs after pushing.

Read-only public observations on 2026-09-11: API health reported main commit
`d1707ba2be3a48dc73126225308fac6e44ddf0fb`; the public web returned Cloudflare headers and CSP
Report-Only, and /terms returned 404. Those observations establish neither all environment values
nor backups, provider regions, contracts, actual payments, web commit identity or deployment
coordination. The connected Vercel team inventory was empty. No production mutation or migration
was performed during this preparation.

## Separate launch backlog

These items do not all have to be implemented to review a closed-mode security merge. They do
need an explicit decision before the affected processing or commercial launch. The backlog
contains engineering, operational and legal work; documentation alone does not close it.
Named people remain **Unassigned**.

| Priority | Work | Responsible role | Dependency | Definition of done |
|---|---|---|---|---|
| P0 before affected collection | Waitlist retention, unsubscribe and erasure | Engineering + privacy owner | Agreed purpose, basis, period and monitored request channel | Tested expiry/deletion and withdrawal path; notice matches actual behavior |
| P0 before broader recording use | Failed webhook payloads and orphan audio | Engineering + operations | Inventory of failure/storage paths and provider retention | Bounded retry/content retention, orphan reconciliation, synthetic failure tests and an owned alert/runbook |
| P0 before broader recording use | Raw transcript minimization | Engineering + privacy reviewer | Reprocessing need and justified retention decision | Every raw copy has an enforced period and verified erasure path; docs match |
| P0 before participant processing expansion | Participant DSR, access and export | Privacy reviewer + support + engineering | Purpose-specific controller/processor assessment and identity/third-party safeguards | Exercised manual or scoped product process meets rights/deadlines without exposing other participants; a general export platform is not required by this PR scope |
| P0 before public legal pages/Live | Legal seller and accountable processing roles | Owner + qualified adviser | Business model and B2B/B2C contract evidence | Verified seller facts, purpose-specific roles and reviewed policy text/version |
| P0 before public support promises | Support and incident/DSR coverage | Owner + operations | Monitored address, backup contact and permissions | Delivery/authentication checks plus a synthetic response exercise with assigned coverage |
| P0 before residency/processing claims | Provider agreements, regions and transfers | Owner + privacy adviser + providers | [Role inventory](data-processors.md) including Cloudflare | Actual service/account evidence; Article 28 terms where a processor role applies, separate-controller arrangements where appropriate, transfer/retention/incident contacts reviewed |
| P0 before consumer Live sales | Withdrawal-function/Paddle responsibility | Owner + adviser + Paddle | Contract/consumer scope and actual hosted flow | Written purpose-specific responsibility assessment and tested reachable function/confirmation/durable receipt where owed; gate approved only for the reviewed implementation |
| P1 separate release | CSP enforcement | Engineering | Report review across app, login, sharing and Paddle overlay | Resolved violations and regression/browser evidence in a dedicated enforcing change |
| P0 before legal launch approval | DPIA/RoPA/DSR/incident review | Accountable controller + adviser | Above factual evidence and workflow decisions | Drafts reviewed, roles assigned, residual-risk decisions recorded and procedures exercised |

No seller identity, agreement, region or approval is supplied by this repository. Keep the launch
record and any incident/request evidence in a restricted system, outside Git.
