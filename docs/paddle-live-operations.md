# Paddle Live operations

This runbook begins only after the [legal seller gate](legal-seller-readiness.md) and reviewed public
policies are complete. It coordinates external Live changes; it does not contain credentials and
must never be used against Sandbox identifiers.

While Paddle's hosted withdrawal flow is still under review, stop here and use
[the waiting-period Live preflight](live-preflight-waiting.md). That runbook permits Sandbox and
fail-closed verification only; it does not authorize any step below.

## 1. Approval and account boundary

- Sign in to the Live vendor dashboard, not the Sandbox dashboard.
- Submit `https://www.syncmemos.com` for domain review with the final public Terms, Privacy, Refund,
  support, seller, and withdrawal pages reachable without authentication.
- Enter the selected legal supplier, identity, address, phone, payout, and tax facts directly in
  Paddle. Do not paste them into chat, GitHub, logs, or this repository.
- Add the second owner as an individual team member and enable two-factor authentication for both.
- Do not proceed until identity, domain, payout, and any requested business checks show approved.

## 2. Exact Live catalog

Create only these products with the `saas` tax category, subject to confirmation in Paddle before
saving. Tax category is a catalog decision and must not be guessed or changed casually after sales.

| Product | Price | Amount in lowest EUR unit | Billing cycle | Trial |
|---|---|---:|---|---|
| Solo | Monthly | `1900` | month, frequency 1 | none |
| Solo | Annual | `18240` | year, frequency 1 | none |
| Team | Monthly | `3900` per seat | month, frequency 1 | none |
| Team | Annual | `37440` per seat | year, frequency 1 | none |

Use EUR base prices, tax-exclusive presentation, and no Business product or price. Record the two
`pro_...` and four `pri_...` identifiers in the deployment secret manager, not in a committed file.
Verify that every product and price is active and exists in Live; Sandbox IDs are never reusable.

Configure:

- balance currency EUR;
- default payment link `https://www.syncmemos.com/pricing`;
- card payments for the first launch window;
- standard Paddle dunning/retain settings unless reviewed terms require a documented change; and
- a Live notification destination at `https://api.syncmemos.com/webhooks/paddle` with the exact
  event set required by `billing:check`.

## 3. Credentials and deployment

Create a least-privilege Live server API key, client-side token, and notification secret. Put server
secrets only in Railway and the client-side token only in Vercel, following
[the production startup contract](paddle-production-hardening.md).

Keep `BILLING_MUTATIONS_ENABLED=false`. Run `npm.cmd run billing:check` from a secure environment,
then deploy and verify the exact commit through `/healthz`. The check must prove the environment,
key prefix, two products, four prices, EUR amounts/intervals, webhook URL/secret, event set, and
absence of a Business price without printing secrets.

## 4. Sandbox mirror cleanup

This is destructive and needs a separate explicit approval immediately before execution.

1. Keep billing mutations disabled.
2. Export `paddle_customers` and `paddle_subscriptions` to a private encrypted location.
3. Verify row counts and that both exports can be read.
4. Resolve the exact production database and table names; stop if the target is ambiguous.
5. Delete only the subscription mirror, then only the customer mirror, in a transaction or other
   recoverable procedure approved for the database.
6. Verify both mirrors are empty and all users, meetings, transcripts, documents, chat, usage, and
   non-Paddle data remain unchanged.
7. Verify existing users resolve to Free entitlements.
8. Disable the Sandbox webhook targeting production or move it to an isolated staging endpoint.

Never commit the exports or run this sequence from an unverified connection.

## 5. Controlled internal Live purchase

Open a scheduled window with two owners present and a rollback owner assigned.

1. Re-run the full API/web test, typecheck, lint, build, remote catalog check, and webhook test.
2. Create a Live discount limited to Solo Monthly, 90% off the first payment only, non-recurring,
   usage limit 1, and expiry within 24 hours.
3. Set `BILLING_MUTATIONS_ENABLED=true`, deploy, and verify the new commit is healthy.
4. One owner completes checkout manually in Paddle with their own card; no card data enters logs,
   chat, screenshots, or the repository.
5. Verify the completed transaction, active Solo Monthly subscription, Live customer/price,
   database mirror, 10-hour allowance, persistence after new login, Customer Portal, HTTP 200
   webhook, and idempotent replay.
6. Archive the discount, issue a full refund, cancel immediately, and verify Free state, the
   2-hour allowance, and removal of the active-subscription UI.
7. Set `BILLING_MUTATIONS_ENABLED=false`, deploy, and verify checkout is blocked while portal,
   cancellation, and webhook receipt remain operational.

Store provider identifiers and results in the private launch record. If any verification fails,
disable billing mutations first and fix Live without restoring Sandbox credentials.

## 6. Paid validation handoff

Only a fully successful internal purchase authorizes the
[48-hour paid customer validation](customer-validation.md). The customer window uses the regular
catalog with no validation discount and closes with billing mutations disabled while the owners
make the documented proceed/iterate/stop decision.
