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

Do not link these routes from the public footer or enable Paddle Live while the publication gate is
closed.

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

Enter public seller facts directly in the Vercel production environment. They are server-only values
and must not be added to source control, chat, issues, or CI logs.

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
malformed required values also keep all routes closed. `BILLING_MUTATIONS_ENABLED` remains `false`
through legal publication and Paddle preflight.

## Release verification

1. Preview the exact reviewed commit with temporary non-sensitive test values and confirm all six
   pages on desktop and mobile.
2. Confirm English/Swedish navigation, effective date, mail and phone links, wrapping of a multiline
   address, and optional registration/VAT rows.
3. Confirm the published text is saveable and printable from the browser.
4. Enter approved production values and deploy while billing mutations remain disabled.
5. Verify all routes anonymously, then replace the footer placeholders with the published routes in
   a separate reviewed commit.
6. Reconcile the public text after any provider, retention, plan, refund, or seller change.

## Primary references for review

- [GDPR Article 13 information requirements](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/)
- [Swedish Electronic Commerce Act](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/)
- [Konsumentverket on the online withdrawal function](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/)
- [Paddle Buyer Terms](https://www.paddle.com/legal/buyer-terms)
- [Paddle Refund Policy](https://www.paddle.com/legal/refund-policy)
- [Paddle seller handbook](https://www.paddle.com/seller-guides/seller-handbook)
