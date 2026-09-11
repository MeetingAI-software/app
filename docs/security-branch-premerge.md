# Pre-merge checklist: PR75 security

Status: technical release checklist, updated 2026-09-11. Open boxes are **not verified**.
Release owner and deputy: **Unassigned**. Merge decision remains with the repository owner.

Merge order is **PR75 security → PR76 docs → PR77 historical withdrawal plan**, all based on main.
The API main workflow runs tests/security checks, stamps the SHA, migrates production, then deploys
to Railway. Vercel can publish the web independently. Green PR CI alone does not prove a safe
production rollout; verify platform settings and the release window first.

## Before the merge button

- [ ] Record a **verified restorable backup**, timestamp, private location, restore test/result
  and responsible operator. An assumed platform backup or an untested export is insufficient.
- [ ] Read the production migration ledger and identify the historical 0011 lineage.
  Use [migration history](../apps/api/drizzle/README.md). Never manually replay both 0011 files.
- [ ] Validate deployed API variables against envSchema without printing values. Record pass/fail
  and variable names only. Blank optional/defaulted strings and numeric values become absent before
  validation; defaults then apply. Nonblank malformed values and enabled features with missing
  prerequisites still fail startup. DATABASE_URL remains required.
- [ ] Confirm API PUBLIC_REGISTRATION_ENABLED=false, LEGAL_POLICIES_PUBLISHED=false,
  BILLING_MUTATIONS_ENABLED=false, and matching web publication, withdrawal-approval and
  launch-pause settings. This release approves no gate opening. Future registration enablement
  requires the API policy version to match reviewed web terms and legal settings.
- [ ] Confirm Google client credentials, HTTPS API callback and WEB_ORIGIN match the registered
  callback URL. [Google deletion](google-account-deletion.md) adds no callback URL. Verify a
  synthetic account roundtrip on an authorized test deployment; retain no raw tokens.
- [ ] Confirm Recall coordination below and the required workspace verification secret before
  deploying the API with signed live delivery. Account for existing calls and retries.
- [ ] Coordinate Vercel and Railway releases and verify production environment protections.
  Schedule no active recording/upload during transition. Old web tabs may need a reload; new web
  code reaching an old API can fail until both versions match.

### Bounded API configuration

| Variable | Allowed range | Default |
|---|---|---|
| PORT | 1–65535 | 3000 |
| MONTHLY_CAP_SECONDS | 1–31536000 | 14400 |
| MAX_MEETING_SECONDS | 60–28800 | 3600 |
| MAX_CONCURRENT_BOTS | 1–20 | 1 |
| MAX_CONCURRENT_UPLOADS | 1–4 | 1 |
| MAX_UPLOAD_MB | 1–100 | 50 |
| MAX_TRANSCRIPT_CHARS | 1000–1000000 | 180000 |
| MAX_CHAT_QUESTIONS_PER_MEETING | 1–100 | 20 |
| CLAUDE_TIMEOUT_MS | 1000–300000 | 60000 |
| EMAIL_DAILY_SEND_BUDGET | 1–1000 | 30 |
| SESSION_TTL_DAYS | 1–90 | 30 |
| MAX_LIVE_STREAM_CONNECTIONS | 1–1000 | 50 |
| MAX_LIVE_STREAM_CONNECTIONS_PER_USER | 1–50 | 5 |
| MAX_LIVE_STREAM_CONNECTIONS_PER_MEETING | 1–20 | 3 |

The source schema governs other provider/gate checks. Upload/SSE capacity is per API process;
replica count changes aggregate limits. No distributed limiter is introduced.

## Migration sequence and expected behavior

SQL 0011–0013 are unchanged. Main independently introduced 0011_demonic_gwen_stacy, whose timestamp
is newer than security 0011–0013. Main databases therefore skip those older security entries.

| Migration | Purpose |
|---|---|
| 0011_windy_master_mold | Historical security share enablement/expiry columns and index |
| 0012_lonely_maggott | Historical organization/business-use/terms evidence |
| 0013_recording_notice_evidence | Historical recording-notice evidence |
| 0014_reconcile_share_lineages | Fill missing columns/index on either lineage; disable links lacking expiry |
| 0015_google_deletion_authorization | Hashed, session-bound OIDC challenges and single-use deletion grants |
| 0016_paddle_anonymization_marker | Durable local customer anonymization marker |

Run the canonical journal in order before API startup. Isolated tests cover empty databases,
upgrades from main 0011/security 0013, retained synthetic meeting data and repeated migration.
They do not prove production backup, permissions, migration history or duration.

Old share links without expiry intentionally stop working; owners must enable a new expiring link.
Google-only deletion requires a new verified Google round and separate final confirmation.
Password accounts still verify their password. Failed provider erasure preserves local records and
requires a new Google grant on retry. Recall errors become generic. SSE/upload saturation gives
bounded failures with Retry-After; see [stream limits](live-stream-limits.md) and [upload limits](upload-limits.md).

## Recall signing and existing bots

RECALL_REALTIME_WEBHOOK_SECRET holds the Recall **workspace verification secret** from the same
workspace/region as the API key and RECALL_BASE_URL. Recall sends signature headers only after
that secret exists. RECALL_WEBHOOK_SECRET protects async delivery; legacy accounts created before
2025-12-15 may use a separate Svix endpoint secret there. Newer workspaces can use the same workspace
secret for both variables. Separate variable names do not imply unequal values.

Verify webhook-id, webhook-timestamp and webhook-signature against the exact raw body. The API
checks a five-minute freshness window and accepts multiple signatures during rotation. Recall
documents a 24-hour overlap for rotated workspace secrets. Retain only configuration evidence and
synthetic verification results, never secrets or raw provider payloads.

LIVE_TRANSCRIPT_ENABLED=false affects newly created bots, not bots already streaming. Coordinate
existing bot endpoints and pending deliveries before retiring the old query-token mechanism;
unsigned live events remain rejected. Remove RECALL_LIVE_WEBHOOK_TOKEN from platform settings and
old endpoint URLs only in the approved rollout window. This PR performs no production change.
Source: [Recall request verification](https://docs.recall.ai/docs/authenticating-requests-from-recallai).

## Verification record and rollback

- [ ] Record final-head Node20 clean npm ci, API/web tests and typechecks, web lint, both production
  builds, full audit with no high/critical, production audit with no findings, secret scan and
  diff/schema/snapshot checks in PR75. Four moderate development-tool advisories follow the
  [manual dependency policy](dependency-security.md); do not force a Drizzle downgrade.
- [ ] Negative auth/ownership/share/webhook/recording-notice/deletion/resource tests and synthetic
  browser smoke pass. Run the same complete checks on the separate security→docs→withdrawal
  integration copy. Real providers are mocked; neither test set is production verification.
- [ ] Current GitHub checks refer to each final head. Docs/withdrawal inherit older main dependencies
  before PR75; assess their own checks and the sequential integration result.
- [ ] After the future release, /healthz reports the intended merged SHA and Vercel production
  identifies the matching source revision. Run the closed-mode legal smoke against
  https://www.syncmemos.com and authorized synthetic account/share checks. Keep CSP **Report-Only**.
  No real payment or launch-gate change belongs in this smoke.

If rollout fails after additive migration, retain new columns and ledger entries. Stop rollout and
select an explicitly tested compatible application version; do not blindly deploy old main, which
can reintroduce unsafe share/deletion behavior. A forward fix or approved service pause may be safer.
Do not drop columns or restore a database automatically; restoration needs a separate operator
decision accounting for writes since backup. Recheck both live revisions and closed-mode behavior.

Read-only observations on 2026-09-11: API health reported main SHA
d1707ba2be3a48dc73126225308fac6e44ddf0fb; web returned Cloudflare and CSP Report-Only headers;
Terms returned 404. The connected Vercel team listing was empty. Backup, platform protections,
full gate configuration, Recall signing and cross-platform rollout timing remain unverified.
