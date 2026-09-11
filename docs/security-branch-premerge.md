# Pre-merge checklist: `fix/security-compliance-hardening`

Merging this branch is not a code event. `.github/workflows/ci.yml` runs
`railway run --service api --environment production -- npm run db:migrate -w api` on every push to
`main`, before the deploy step. The moment the PR is merged, production migrates and the new image
is rolled out. Everything below must be true **before** the merge button, not after.

This branch also tightens environment validation. `apps/api/src/config/env.ts` calls
`process.exit(1)` when validation fails, so a production value that is now out of range does not
degrade — the API refuses to boot and the deploy's SHA health check fails after five minutes.

Owner: `Unassigned` — assign before merging.

## 1. Secrets

- [ ] `RECALL_REALTIME_WEBHOOK_SECRET` is set in Railway (production).
      Hard boot requirement when `BOT_PROVIDER=recall` and `LIVE_TRANSCRIPT_ENABLED` is `true`
      (the default). It is the workspace verification secret for the signed Recall live webhook,
      and it must be a *new* value, not a copy of `RECALL_WEBHOOK_SECRET`.
- [ ] `RECALL_LIVE_WEBHOOK_TOKEN` is removed from Railway. The branch deletes it from the schema;
      leaving it set is not a boot failure, but it is a query-string secret of the kind the audit
      flagged, and it should not outlive the code that read it.
- [ ] Both values are recorded wherever your other production secrets are recorded — not in this
      repo, not in a commit, not in a chat message.

## 2. Bounded configuration

The branch replaces unbounded coercion with explicit ranges. Read the current production value for
each variable in Railway and confirm it is inside the range. The schema explicitly normalizes
empty/whitespace-only optional and defaulted string fields and numeric limits to absence before
validation. Numeric defaults therefore apply to blanks; raw JavaScript number coercion would have
produced zero. Nonblank out-of-range values remain boot errors. Required values for enabled
providers, recording and registration must still be supplied and valid.

| Variable | Allowed | Default |
|---|---|---|
| `PORT` | 1–65535 | 3000 |
| `MONTHLY_CAP_SECONDS` | 1–31 536 000 | 14400 |
| `MAX_MEETING_SECONDS` | 60–28 800 | 3600 |
| `MAX_CONCURRENT_BOTS` | 1–20 | 1 |
| `MAX_CONCURRENT_UPLOADS` | 1–4 | 1 |
| `MAX_UPLOAD_MB` | 1–100 | 50 |
| `MAX_TRANSCRIPT_CHARS` | 1000–1 000 000 | 180000 |
| `MAX_CHAT_QUESTIONS_PER_MEETING` | 1–100 | 20 |
| `CLAUDE_TIMEOUT_MS` | 1000–300 000 | 60000 |
| `EMAIL_DAILY_SEND_BUDGET` | 1–1000 | 30 |
| `SESSION_TTL_DAYS` | 1–90 | 30 |

- [ ] Every production value above checked against its range.

## 3. Database

- [ ] A backup of the production database is taken and its location noted. The migrations below add
      columns and an index; they do not drop anything, but the deploy runs them unattended.
- [ ] The three migrations this branch adds are understood as *new* migrations, renumbered during
      the rebase so they sit after `main`'s waitlist migration:
      - `0011_windy_master_mold` — `meetings.share_enabled`, `meetings.share_expires_at`,
        `meetings_share_expiry_idx`
      - `0012_lonely_maggott` — `users.organization_name`, `users.business_use_confirmed_at`,
        `users.terms_version_accepted`
      - `0013_recording_notice_evidence` — `meetings.recording_notice_confirmed_at`,
        `meetings.recording_notice_version`
- [ ] `apps/api/drizzle/meta/_journal.json` runs 0 → 13 with no gap and no duplicate `idx`.

## 4. Gates stay closed

- [ ] `LEGAL_POLICIES_PUBLISHED`, `LEGAL_WITHDRAWAL_FLOW_APPROVED` and `BILLING_MUTATIONS_ENABLED`
      are `false` in every environment this deploy touches. Nothing in this branch is meant to open
      a gate, and registration is fail-closed until the policies are published.

## 5. Tests the audit report requires

Beyond green CI, the report asks for the negative cases to be exercised deliberately:

- [ ] OAuth `state` — a callback with a missing, stale or mismatched `state` is rejected.
- [ ] Share links — an expired link and a revoked link both fail; a disabled share is not readable.
- [ ] Webhook signature — an unsigned delivery, a wrong-signature delivery and a replay older than
      the five-minute freshness window are all rejected.
- [ ] Account deletion — provider-side deletion failure leaves the account undeleted (fail-closed),
      and a successful deletion leaves no audio and no recording behind.

## 6. After the merge

- [ ] The deploy job's "Verify the merged commit is serving" step is green.
- [ ] Closed-gate smoke test:
      `npm run legal:smoke -- --base-url=https://www.syncmemos.com --mode=closed`
      (`www`, not the apex — the apex answers 308 and the script does not follow redirects.)
- [ ] The CSP is still shipped as `Content-Security-Policy-Report-Only`
      (`apps/web/next.config.ts`, `CSP_REPORT_ONLY = true`). Walk the app once — landing, pricing,
      settings, an in-room recording played back, and the Paddle overlay in sandbox — with the
      console open, then flip the flag in a separate PR. This is deliberately not part of this
      merge: an enforcing typo breaks the page, Report-Only cannot.
