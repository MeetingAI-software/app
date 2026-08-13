# Paddle production startup guard

This runbook describes the code-enforced boundary between Paddle Sandbox and Live. It does not
authorize a Live launch. The legal seller, public seller address, legal policies, customer
validation, Paddle approval, and production catalog must still be completed by their owners.

Keep `BILLING_MUTATIONS_ENABLED=false` while preparing and verifying Live. The flag controls new
checkout and subscription mutations; it does not weaken startup validation.

## Production API contract

When `NODE_ENV=production` and `PADDLE_ENV=production`, API startup requires:

- `PADDLE_API_KEY` with the `pdl_live_apikey_` prefix;
- no `PADDLE_SANDBOX_API_KEY` variable;
- `PADDLE_NOTIFICATION_WEBHOOK_SECRET`;
- four distinct `pri_` IDs for Solo Monthly, Solo Annual, Team Monthly, and Team Annual.

Before repositories, workers, or the HTTP listener start, the API requests the Live Paddle
catalog and verifies:

- exactly four active prices exist in the account;
- every configured ID references an active price;
- all prices use EUR;
- amounts are EUR 19.00, 182.40, 39.00, and 374.40 respectively;
- billing intervals are monthly or annual as configured, with frequency 1;
- the prices belong to exactly two active products named `Solo` and `Team`.

Any API error or mismatch rejects bootstrap. No credential values are logged by the guard. The
deployment should remain unhealthy until the configuration or Paddle catalog is corrected.

## Dashboard boundaries

Configure server secrets only in Railway and the client-side token only in Vercel. Do not commit
real values or paste them into chat, issues, or deployment logs.

Railway needs the Live API key, webhook secret, four Live price IDs, `PADDLE_ENV=production`, and
`BILLING_MUTATIONS_ENABLED=false`. Remove the sandbox fallback key before deployment.

Vercel needs `NEXT_PUBLIC_PADDLE_ENV=production`, a Live client-side token, the same four Live
price IDs, and the public API URL. It must not receive the API key or webhook secret.

## Verification order

1. Complete customer validation and every legal seller gate.
2. Obtain Paddle Live approval and create the exact catalog and notification destination.
3. Enter secrets directly in Railway and Vercel with billing mutations still disabled.
4. Run `npm.cmd run billing:check` in a secure environment; it verifies both apps, the webhook,
   and the remote catalog without printing secrets.
5. Deploy the API. Confirm it becomes healthy and logs no catalog mismatch.
6. Keep billing mutations disabled until the separately approved first-Live-purchase window.

To roll back a bad configuration, leave `BILLING_MUTATIONS_ENABLED=false`, correct the Live values
or catalog, and redeploy. Never make a production deployment boot by adding Sandbox credentials.
