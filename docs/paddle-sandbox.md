# Paddle sandbox runbook

Run the automated check from the repository root:

```powershell
npm.cmd run billing:check
```

It validates environment alignment, credential prefixes, all four checkout price IDs against
the Paddle sandbox API, exactly two active products and four active EUR prices, the deployed
webhook URL, the complete event set, and the configured destination secret. It never prints
credential values.

Business is contact-only. Do not configure Business product or price IDs in either app.

## Complete the webhook setup

1. Set the Sandbox Default payment link to `https://www.syncmemos.com/pricing`.
2. Use `https://api.syncmemos.com/webhooks/paddle` as the Paddle notification destination.
3. In Paddle Sandbox, subscribe the destination to at least:
   - `customer.created`
   - `customer.updated`
   - `subscription.created`
   - `subscription.activated`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.past_due`
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.trialing`
   - `transaction.completed`
   - `transaction.payment_failed`
4. Put that destination's secret in `apps/api/.env`:

```dotenv
PADDLE_ENV=sandbox
BILLING_MUTATIONS_ENABLED=false
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_NOTIFICATION_WEBHOOK_SECRET=pdl_ntfset_...
```

The API key may instead be supplied through the process/CI environment. Keep all server-side
credentials out of `apps/web`.

## Controlled deployed test window

1. Remove `NEXT_PUBLIC_PADDLE_BUSINESS_MONTHLY_PRICE_ID` and
   `NEXT_PUBLIC_PADDLE_BUSINESS_ANNUAL_PRICE_ID` from both Railway and Vercel.
2. Deploy Vercel and Railway with Sandbox credentials and
   `BILLING_MUTATIONS_ENABLED=false`.
3. Run the health check, tests, typecheck, builds, and `npm.cmd run billing:check`.
4. Set only Railway's `BILLING_MUTATIONS_ENABLED=true` and redeploy the API.
5. Confirm an authenticated checkout can open. Keep the window attended; use Sandbox cards only.
6. Complete the scenarios below.
7. Set `BILLING_MUTATIONS_ENABLED=false` immediately after the final scenario and redeploy.
8. Confirm checkout and plan changes return HTTP 503 with
   `BILLING_MUTATIONS_DISABLED`, while Customer Portal still opens.

## End-to-end Sandbox scenarios

1. Test Solo Monthly, Solo Annual, Team Monthly, and Team Annual with `4242 4242 4242 4242`,
   any future expiry, and any three-digit CVC. Use a fresh app user after canceling each test
   subscription so the duplicate-subscription guard remains meaningful.
2. Confirm every successful checkout redirects to `/checkout/success`.
3. Confirm Paddle's notification log returns HTTP 200 and `paddle_customers` plus
   `paddle_subscriptions` contain the expected customer, subscription, price, quantity, and plan.
4. Sign out and back in; confirm the paid entitlements remain.
5. Open `https://www.syncmemos.com/pricing?_ptxn=<sandbox-transaction-id>` and confirm Paddle.js
   opens that transaction automatically.
6. Replay the same notification and confirm both tables still contain one row per Paddle ID.
7. Test 3DS with `4000 0038 0000 0446` and a decline with `4000 0000 0000 0002`.
8. Test `4000 0027 6000 3184`, then simulate the failed renewal and confirm the mirrored status
   becomes `past_due` while access follows the configured grace-period policy.
9. Run pause and resume simulations and confirm access is removed/restored from webhook state.
10. Run a cancellation simulation and confirm `scheduled_change_action=cancel` while access is
   still active, followed by status `canceled` when cancellation takes effect.

Do not switch to production keys, products, prices, or destinations until this entire sandbox
flow passes. Sandbox and production Paddle resources are separate.
