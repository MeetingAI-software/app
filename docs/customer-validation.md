# 48-hour paid customer validation

This runbook tests whether real customers buy Syncmemos at the published prices. It is a controlled
post-readiness sales window, not permission to bypass the legal, policy, Paddle, provider, security,
or deployment gates.

## Entry gate

Do not contact prospects with an active sales offer or accept payment until all of these are true:

- the owners retained Swedish tax/business guidance and selected exactly one legal supplier;
- the owners' agreement, lawful public contact details, and payout account are complete;
- professionally reviewed English and Swedish Terms, Privacy, Refund, and applicable withdrawal
  flows are publicly available without placeholders;
- Paddle approved the supplier and domain, and the exact Live catalog and webhook are configured;
- production passed `billing:check`, the complete test/build suite, and a webhook replay test;
- one controlled internal Live purchase, refund, cancellation, entitlement rollback, and portal
  check completed successfully; and
- `BILLING_MUTATIONS_ENABLED` is `false` immediately before the scheduled window opens.

If any entry condition becomes false, do not start or pause the window without taking another
payment.

## Success criteria

Complete the following in one focused 48-hour window:

- contact exactly 30 relevant Swedish prospects individually;
- hold at least 5 live conversations or product demos;
- present the published Solo and Team prices without a validation discount;
- obtain 3 completed, full-price Paddle subscriptions from genuine target customers; and
- record objections, alternatives, required features, and buyer role using anonymous prospect IDs.

A verbal promise, wait-list signup, free user, internal owner purchase, refunded test transaction,
manual payment, or subscription bought as a favor does not count.

## Offer under test

| Plan | Price presented | Core allowance |
|---|---:|---|
| Solo Monthly | EUR 19/month, excluding VAT | 10 recording hours/month |
| Solo Annual | EUR 182.40/year, excluding VAT | Same Solo allowance, billed annually |
| Team Monthly | EUR 39/seat/month, excluding VAT | 20 recording hours/month per seat |
| Team Annual | EUR 374.40/seat/year, excluding VAT | Same Team allowance, billed annually |

Paddle Checkout calculates tax and captures the card. Explain automatic renewal, the regular
renewal price, no free trial, cancellation through Settings/Customer Portal, and the reviewed
14-day first-purchase guarantee before checkout. A customer who cancels renewal keeps the already
paid period according to the reviewed Terms and Paddle subscription state.

Never accept Swish, cash, bank transfer, card details, or an invoice outside Paddle for this test.
Do not create a separate one-month product or ask a customer to connect a card later.

Demonstrate only functionality that exists. In-room recording remains unavailable unless the
production availability flag and provider verification are both complete.

## Prospect allocation

Prepare exactly this mix:

- `P01-P15`: founders, agency owners, or independent consultants with frequent client meetings;
- `P16-P25`: sales or customer-success leaders who influence tool purchasing; and
- `P26-P30`: recruitment leaders or independent recruiters with frequent interviews.

Prefer prospects who already pay for meeting, CRM, transcription, documentation, or productivity
software. Exclude students without buying authority and friends who do not experience the problem.
Warm introductions are allowed when the relationship is recorded anonymously.

## Data minimization

Copy [the validation tracker](customer-validation-tracker.md) to a private working document. Keep
names, email addresses, phone numbers, customer statements, transaction IDs, webhook IDs, and call
notes outside the repository. The committed report may contain aggregate anonymous counts only.

Do not record a research call by default. If recording is useful, obtain consent and follow the
same participant-notification flow used by the product.

## Outreach

Personalize the first sentence and send each message manually from an appropriate individual
account. Do not bulk-send through the support inbox.

### Swedish initial message

> Hej! Jag bygger Syncmemos, som gör mötesinspelningar till sökbara transkript, sammanfattningar och
> delbara dokument med tidsstämplar. Jag vill förstå hur [relevant roll/verksamhet] hanterar
> uppföljning efter många kundmöten idag. Har du 15 minuter för att visa ditt nuvarande arbetssätt
> och ge rak feedback på en kort demo? Om det löser ett verkligt problem finns tjänsten att köpa
> till ordinarie pris, men ett nej är lika värdefullt för oss som ett ja.

### Qualified follow-up

> Tack för din raka feedback. Planen som passar ditt arbetssätt är [Solo/Team och intervall] för
> [pris] exklusive moms [och antal platser]. Skatt räknas i Paddle Checkout, abonnemanget förnyas
> automatiskt till samma ordinarie pris och kan sägas upp via Settings. Det finns ingen gratis
> provperiod och den första prenumerationen omfattas av vår granskade 14-dagarsgaranti. Vill du köpa
> den planen nu via Syncmemos?

Do not claim scarcity, guaranteed savings, customer counts, certifications, or regional processing
that cannot be proved.

## Interview and demo

1. Ask about the last meeting whose outcome the prospect needed to remember or share.
2. Establish the existing process, time cost, missed actions, current tools, and current spend.
3. Confirm who uses the result and who approves a purchase.
4. Ask about recording consent, security, language, integrations, and procurement blockers.
5. Demonstrate the smallest real workflow matching the stated problem with fabricated data.
6. Show transcript, structured document, timestamp navigation, grounded chat, share, and export.
7. Present exactly one recommended plan and the complete purchase terms.
8. Let the prospect decide without operating checkout or entering card details for them.

## Paid-subscription standard

A purchase counts only when all of these are privately verified:

- the buyer belongs to one of the target segments and is not an owner or internal tester;
- Paddle reports a completed full-price Live transaction;
- the subscription has the intended plan, interval, seat count, currency, and active status;
- the local Paddle customer/subscription mirror contains the matching state;
- Settings shows the correct plan and allowance after a new login; and
- Customer Portal opens for the correct authenticated account.

Record only `yes`/`no` verification results in the anonymous tracker. Keep provider identifiers and
customer evidence in the private launch record.

## Schedule and billing controls

### Hours 0-4

- re-run the entry gate and record approval privately;
- prepare the 30 prospects and fabricated demo data;
- set `BILLING_MUTATIONS_ENABLED=true`, deploy, and verify production health;
- send the first 15 personalized messages.

### Hours 4-24

- send the remaining 15 messages;
- run the first calls and demos;
- verify each completed purchase before counting it;
- change only unclear wording, not the offer, price, or success threshold.

### Hours 24-48

- follow up once where appropriate;
- complete at least 5 calls/demos;
- reconcile Paddle, application state, and the anonymous tracker;
- set `BILLING_MUTATIONS_ENABLED=false` and verify that new checkout is blocked while Customer
  Portal and cancellation remain available;
- write the aggregate decision report.

If checkout, webhook processing, entitlements, policy access, or customer support fails, disable
billing mutations immediately and stop outreach until the incident is resolved.

## Decision rule

**Proceed toward public launch** only when 30 prospects were contacted, at least 5 qualified demos
were completed, and 3 genuine customers hold verified full-price subscriptions.

**Iterate and validate again** when calls reveal a repeated problem but fewer than 3 prospects buy.
Change one major variable at a time: segment, message, workflow, or price. Any changed price must be
updated consistently in the product, legal copy, and Paddle catalog before another paid window.

**Stop paid acquisition** when fewer than 5 qualified calls occur, purchases mainly come from
friends doing a favor, a required feature does not exist, or production/payment support is unsafe.
Existing customers must retain access and cancellation/support rights; disabling billing mutations
must never break webhook receipt or Customer Portal.

## Aggregate report

Record the funnel, segment breakdown, three purchases by plan, repeated pains, objections,
competitors, current-spend ranges, supported product changes, incidents/refunds, and an explicit
`proceed`, `iterate`, or `stop` decision. Do not commit identifiable evidence.
