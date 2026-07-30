# Paddle sandbox runbook

Run the automated check from the repository root:

```powershell
npm.cmd run billing:check
```

It validates environment alignment, credential prefixes, all four checkout price IDs against
the Paddle sandbox API, active notification destinations, required event subscriptions, and the
configured destination secret. It never prints credential values.

## Complete the webhook setup

1. Start the API on port 3000 and expose it through a stable HTTPS tunnel or deploy it.
2. Use `<public-api-url>/webhooks/paddle` as the Paddle notification destination.
3. In Paddle Sandbox, subscribe the destination to at least:
   - `customer.created`
   - `customer.updated`
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
4. Put that destination's secret in `apps/api/.env`:

```dotenv
PADDLE_ENV=sandbox
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_NOTIFICATION_WEBHOOK_SECRET=pdl_ntfset_...
```

The API key may instead be supplied through the process/CI environment. Keep all server-side
credentials out of `apps/web`.

## End-to-end sandbox test

1. Run `npm.cmd run billing:check` and require a successful result.
2. Start both API and web apps.
3. Open `/pricing`, select Solo or Team, and complete checkout with `4242 4242 4242 4242`,
   any future expiry, and any three-digit CVC.
4. Confirm the redirect to `/checkout/success`.
5. Confirm the Paddle notification log returns HTTP 200.
6. Confirm `paddle_customers` and `paddle_subscriptions` contain the customer and subscription.
7. Replay the same notification and confirm the rows remain idempotent.
8. Test a decline with `4000 0000 0000 0002`.
9. Run a cancellation simulation and confirm `scheduled_change_action=cancel` while access is
   still active, followed by status `canceled` when cancellation takes effect.

Do not switch to production keys, products, prices, or destinations until this entire sandbox
flow passes. Sandbox and production Paddle resources are separate.
