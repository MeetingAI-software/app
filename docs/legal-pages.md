# Legal pages publication runbook

Syncmemos has English and Swedish routes for Privacy, Terms, and Refund Policy. They are deliberately
fail-closed: every route returns 404 unless the policy text, seller details, and applicable consumer
withdrawal flow have all been approved. This prevents an inferred supplier, a private address, or an
unreviewed policy from being published during an ordinary deployment.

## Routes

| English | Swedish |
|---|---|
| `/privacy` | `/sv/privacy` |
| `/terms` | `/sv/terms` |
| `/refund-policy` | `/sv/refund-policy` |

The landing, login, and signup footers reveal these routes only while the same server-side
publication gate is open. No separate public environment flag exists, so navigation cannot drift
from route availability. Do not enable Paddle Live while the gate is closed.

## Required private review

Before changing any environment variable, complete the seller gate in
[legal seller readiness](legal-seller-readiness.md) and retain evidence privately. A qualified
Swedish adviser must review both language versions and confirm:

- the selected supplier identity and the public name, address, country, email, and phone;
- any registration and VAT identifiers that must be shown;
- the stated processing purposes, legal bases, recipients, transfers, retention, and data-subject
  rights against the production processor configuration;
- recording responsibility and the relationship between the organiser and meeting participants;
- automatic renewal, cancellation, Paddle's buyer terms, and the commercial first-purchase
  14-day guarantee;
- the statutory withdrawal rules for immediate digital-service access; and
- the visible withdrawal function, automatic acknowledgement, refund handling, and records required
  for purchases made through the application.

The repository includes policy drafts for review, not legal advice. Approval must apply to the exact
Git commit being deployed.

## Publication configuration

Enter public seller facts directly in **Vercel > Project Settings > Environment Variables** for the
Production environment. They are server-only values and must not be added to source control, chat,
issues, or CI logs. Do not prefix them with `NEXT_PUBLIC_`; the browser receives only the resulting
published/not-published boolean.

```text
LEGAL_POLICIES_PUBLISHED=true
LEGAL_WITHDRAWAL_FLOW_APPROVED=true
LEGAL_POLICIES_VERSION=YYYY-MM-DD
LEGAL_SELLER_NAME=<approved public supplier name>
LEGAL_SELLER_ADDRESS=<approved public service address>
LEGAL_SELLER_COUNTRY=Sweden
LEGAL_SELLER_EMAIL=support@syncmemos.com
LEGAL_SELLER_PHONE=<approved public support phone>
LEGAL_SELLER_REGISTRATION_NUMBER=<only when applicable>
LEGAL_SELLER_VAT_NUMBER=<only when applicable>
```

The two boolean values must remain `false` until their gates are actually complete. Missing or
malformed required values also keep all routes and footer navigation closed. Optional registration
and VAT values should be omitted rather than filled with placeholders when they do not apply.
`BILLING_MUTATIONS_ENABLED` remains `false` through legal publication and Paddle preflight.

## Release verification

1. In Vercel Preview only, use non-sensitive test values with both booleans enabled and verify the
   exact reviewed commit on desktop and mobile. Never copy test values into Production.
2. Confirm all six routes, English/Swedish cross-navigation, effective date, email and phone links,
   multiline address wrapping, and optional registration/VAT rows.
3. Confirm the landing, login, and signup footers show Privacy, Terms, and Refund links, contain no
   placeholder links, and that the published text is saveable and printable.
4. In Vercel Production, enter the approved seller fields first while both booleans remain `false`,
   redeploy, and anonymously confirm the routes return 404 and the footers hide legal navigation.
5. After the seller and policy evidence is complete, set the reviewed version date and change both
   booleans to `true`. Redeploy the same reviewed commit while billing mutations remain disabled.
6. Verify all six routes and the three public footers anonymously. Confirm the page source and
   client JavaScript do not contain seller values on non-legal pages.
7. Record the deployed commit, policy version, anonymous checks, and approver in the private evidence
   record. Reconcile the text after any provider, retention, plan, refund, or seller change.

## Rollback

If any seller fact, policy, or withdrawal behavior is wrong, set `LEGAL_POLICIES_PUBLISHED=false`
first and redeploy. All six routes then return 404 and all three footers hide their legal links.
Keep billing mutations disabled, correct and re-review the configuration, then repeat the release
verification. Do not restore Sandbox Paddle credentials as part of a legal-page rollback.

## Paddle handoff

Start Paddle Live domain review only after the anonymous Production checks pass. Submit every domain
or subdomain that will launch checkout, and keep `BILLING_MUTATIONS_ENABLED=false` until the later
controlled internal Live-purchase window. Continue with [Paddle Live operations](paddle-live-operations.md)
for catalog, credentials, webhook, preflight, and purchase verification.

## Primary references for review

- [GDPR Article 13 information requirements](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/)
- [Swedish Electronic Commerce Act](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/)
- [Konsumentverket on the online withdrawal function](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/)
- [Paddle Buyer Terms](https://www.paddle.com/legal/buyer-terms)
- [Paddle Refund Policy](https://www.paddle.com/legal/refund-policy)
- [Paddle seller handbook](https://www.paddle.com/seller-guides/seller-handbook)
