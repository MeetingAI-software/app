# Live preflight while Paddle withdrawal review is pending

This runbook covers work that is safe before Paddle has answered the Swedish online-withdrawal
questions. It does not authorize legal publication, Live catalog creation, domain review, or a real
payment. Production must keep:

```text
LEGAL_POLICIES_PUBLISHED=false
LEGAL_WITHDRAWAL_FLOW_APPROVED=false
BILLING_MUTATIONS_ENABLED=false
```

The two `LEGAL_*` values are Vercel-only server configuration. `BILLING_MUTATIONS_ENABLED` remains
false in Railway before and after every attended Sandbox window.

## Automated checks

Run the closed Production check anonymously:

```powershell
npm.cmd run legal:smoke -- --base-url https://www.syncmemos.com --mode closed
```

It verifies six legal 404s, hidden legal/withdrawal links on landing, login, and signup, and a hidden
withdrawal link in Settings. The checker sends no cookies or authorization headers and never prints
response bodies.

For a public Vercel Preview, use non-sensitive test seller values and enable both legal flags only
for Preview. Then run:

```powershell
npm.cmd run legal:smoke -- --base-url https://PREVIEW_HOST --mode open
```

The Preview command verifies all six policies, language switches, three public footers, Settings,
and the `https://paddle.net` handoff. The URL must be a bare HTTP(S) origin. If Vercel Deployment
Protection requires authentication, perform the equivalent browser checks manually; never pass a
bypass token, cookie, seller record, or password to this script or a committed command.

Run the local quality gates after either check:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run lint -w web
git diff --check
```

`npm.cmd run billing:check` remains the remote catalog/default-notification check. Run it only from
a secure environment that already contains the intended Sandbox credentials. It validates prefixes,
two products, four EUR prices, intervals, the notification URL, its required event set, and its
destination secret without printing credential values.

## Attended Sandbox regression

Follow [the Sandbox runbook](paddle-sandbox.md) and use only Paddle test cards. Cover:

- Solo and Team monthly and annual checkout;
- ordinary success, 3DS, decline, and a failed later renewal;
- `_ptxn`, new login, plan allowance, and Customer Portal;
- `past_due`, pause, resume, scheduled cancellation, and final cancellation;
- webhook response status, resource replay, and one row per Paddle resource id.

Use Paddle's Sandbox simulator for subscription creation, renewal failure, pause, resume, and
cancellation. The notification destination must accept simulation traffic and use its own Sandbox
secret. Inspect Paddle's recorded request and response without copying payloads or customer data to
GitHub. Close the attended window by restoring `BILLING_MUTATIONS_ENABLED=false`, redeploying, and
confirming checkout/plan changes return `BILLING_MUTATIONS_DISABLED` while webhook receipt and the
Customer Portal remain available.

## Private preparation

These activities happen outside the repository and chat:

- obtain qualified Swedish review of the exact deployed legal commit;
- retain the seller decision, public-service address, phone, review evidence, and Paddle reply;
- verify the Live account email, enable 2FA for both owners, invite separate users, and record the
  Seller ID;
- prepare identity and payout evidence without creating Live credentials or catalog entities;
- prepare 30 prospects, fabricated demo data, the demo agenda, objections log, and a private copy of
  [the anonymous tracker](customer-validation-tracker.md).

Discovery interviews may discuss the problem and demonstrate existing behavior. Do not make an
active paid offer, accept payment, or count a customer before every entry gate in
[the paid-validation runbook](customer-validation.md) is complete.

## Paddle Support follow-up

After three business days without a substantive answer, reply in the existing thread from the
email address linked to the Paddle seller account. Include the Seller ID and request a point-by-point
answer. After five business days, follow up through `sellers@paddle.com`, reference the original
case, and use the subject `Follow-up: Swedish online withdrawal function compliance`.

A complete response must expressly cover whether `paddle.net -> Request refund`, for Swedish Paddle
Checkout purchases after 19 June 2026:

1. identifies or confirms the buyer and affected contract;
2. requires an explicit final confirmation of withdrawal;
3. sends an immediate readable, durable receipt containing the received time;
4. is stably reachable at `https://paddle.net` for links in the footer, policy, and billing page; and
5. is intended to meet the applicable Swedish online-withdrawal-function requirement.

A general explanation of refunds, buyer support, or Paddle's Merchant-of-Record role is not approval.
Save the response privately and follow the positive, incomplete, or negative path in
[the legal publication runbook](legal-pages.md).

## Evidence and handoff

Copy [the readiness record template](live-preflight-record.template.md) to the private launch record.
Do not commit a completed record if it would identify a seller, buyer, account, transaction, Paddle
resource, support case, or deployment secret. When the withdrawal answer and professional review are
complete, resume at legal publication; Live catalog and credential work begins only after domain,
identity, and payout approval.
