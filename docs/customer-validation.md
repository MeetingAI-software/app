# 48-hour customer validation

This runbook tests whether real customers are willing to buy Syncmemos at the published prices.
It is not a launch and it must not collect money. Keep `BILLING_MUTATIONS_ENABLED=false` throughout
the exercise and do not promise a launch date before the legal seller gate is complete.

## Success criteria

Complete the following within one focused 48-hour window:

- contact at least 30 relevant prospects;
- hold at least 5 live conversations or product demos;
- present the real Solo and Team prices without an invented discount;
- obtain at least 2 written, unambiguous statements that the prospect is prepared to buy a named
  plan at its stated price when sales open;
- record objections, alternatives, required features, and the decision-maker for each qualified
  conversation.

A request for more information, a wait-list signup, general praise, or willingness to use the
product for free is not purchase intent.

## Offer under test

Use the product and pricing page as the source of truth. At the time this runbook was written:

| Plan | Price presented | Core allowance |
|---|---|---|
| Solo Monthly | EUR 19/month, excluding VAT | 10 recording hours/month |
| Solo Annual | EUR 182.40/year, excluding VAT | Same Solo allowance, billed annually |
| Team Monthly | EUR 39/seat/month, excluding VAT | 20 recording hours/month per seat |
| Team Annual | EUR 374.40/seat/year, excluding VAT | Same Team allowance, billed annually |

Explain that tax is calculated at checkout, subscriptions renew automatically, there is no free
trial, and the intended first-purchase guarantee is 14 days. Do not take an order or describe these
terms as active until the legal policies and Paddle Live account are ready.

Show only functionality that exists. Online meeting bots, transcripts, summaries, structured
documents, timestamp-grounded chat, share links, and export can be demonstrated when operational.
In-room recording is currently disabled pending verified regional provider configuration; describe
it as unavailable, not as an active Team feature.

## Prospect mix

Choose people who regularly attend meetings and can influence a purchase. A useful 30-prospect mix
is:

- 10 freelancers, consultants, recruiters, or agency owners who could buy Solo;
- 10 managers or operations/customer-success leads in teams of 3-20 people;
- 10 founders, sales leaders, or product leads already paying for meeting or documentation tools.

Avoid filling the list with friends who do not have the problem, students without buying authority,
or people receiving a favor in return. Warm introductions are acceptable, but record the
relationship so the signal can be interpreted honestly.

## Data minimization

Use [the validation tracker template](customer-validation-tracker.md). Assign prospect IDs such as
`P01`; do not commit names, personal email addresses, phone numbers, call recordings, raw notes, or
customer confidential information. Keep identifiable contact details in the owners' private system
and delete them when no longer needed.

Ask before recording any research call. The default is written notes without recording.

## Outreach messages

Personalize the first sentence. Do not claim the recipient was selected by an automated system and
do not send bulk unsolicited email through the support mailbox.

### Swedish

> Hej! Jag bygger Syncmemos, som gör mötesinspelningar till transkript, tydliga sammanfattningar och
> delbara dokument med tidsstämplar. Jag försöker förstå hur personer som har många möten löser det
> idag. Har du 15 minuter för att visa ditt nuvarande arbetssätt och ge ärlig feedback på en kort
> demo? Det är en produktintervju, inte ett säljutskick, och vi tar inte emot betalningar ännu.

Follow-up after a qualified demo:

> Tack för din raka feedback. Priset vi testar är EUR 19/månad exklusive moms för Solo, eller EUR
> 39/seat/månad exklusive moms för Team. Om produkten vid lansering fungerar som demon idag, skulle
> du vara beredd att köpa [plan] till det priset? Ett nej eller "inte ännu" är lika värdefullt som
> ett ja. Vi ber inte om betalning eller kortuppgifter.

### English

> Hi! I am building Syncmemos, which turns meeting recordings into transcripts, clear summaries,
> and shareable timestamped documents. I am trying to understand how people with frequent meetings
> solve this today. Would you spend 15 minutes showing me your current workflow and giving candid
> feedback on a short demo? This is a product interview, not a sales message, and we are not taking
> payments yet.

Follow-up after a qualified demo:

> Thanks for the candid feedback. The price we are testing is EUR 19/month excluding VAT for Solo,
> or EUR 39/seat/month excluding VAT for Team. If the launch product works as demonstrated today,
> would you be prepared to buy [plan] at that price? A no or "not yet" is as useful as a yes. We are
> not asking for payment or card details.

## Interview guide

Spend most of the call on the prospect's existing behavior before showing the product.

1. Tell me about the last meeting whose outcome you needed to remember or share.
2. What did you produce after it, who did the work, and how long did that take?
3. What gets lost or delayed in the current process?
4. What tools have you tried or paid for? What made you keep or cancel them?
5. Who feels this problem most, and who approves the purchase?
6. What security, consent, integration, language, or procurement requirement could block use?
7. Demonstrate the smallest real workflow that addresses the described problem.
8. Ask what is confusing or missing before explaining it away.
9. Present the appropriate real plan and price.
10. Ask the written purchase-intent question after the call, without pressuring for a yes.

Do not ask "Would you use this?" in isolation. Ask about past behavior, current spend, urgency, and
the actual purchase process. Capture exact objections in paraphrased form without identifiable or
confidential details.

## Demo checklist

- Use fabricated meeting content or data the prospect has explicitly authorized for the demo.
- Explain recording consent and participant notification before showing a recording flow.
- Show a real transcript, structured document, timestamp navigation, grounded chat, and share flow.
- Do not demonstrate in-room recording while it is operationally disabled.
- State the relevant monthly and annual price, VAT treatment, allowance, and Team per-seat model.
- State that billing is not open and never collect card or bank details.
- End with the next decision, not a vague promise to follow up.

## Written purchase-intent standard

Count a response only when all of these are present:

- a clear affirmative statement from a plausible buyer or purchase influencer;
- a named plan and billing interval;
- the correct price and, for Team, seat count or a realistic initial range;
- acknowledgement that VAT may be added;
- a condition no broader than the demonstrated product being available when sales open.

Example that counts:

> If Syncmemos launches with the workflow you demonstrated, I am prepared to buy Solo Monthly at
> EUR 19/month excluding VAT.

Example that does not count:

> Looks useful. Let me know when it is ready.

Purchase intent is evidence, not a contract, reservation, invoice, or guarantee. Do not take a
deposit.

## 48-hour schedule

### Hours 0-4

- define one primary segment and one backup segment;
- create 30 anonymized tracker rows and map each ID privately to a contact;
- prepare fabricated demo data and test the demo path;
- send the first 15 personalized messages.

### Hours 4-24

- send the remaining messages;
- run and record outcomes from the first calls;
- refine only unclear wording, not the price or success criteria;
- send the written price question to qualified participants.

### Hours 24-48

- follow up once with non-responders where appropriate;
- complete at least 5 calls or demos;
- classify written responses against the strict standard above;
- summarize repeated pains, objections, alternatives, and blockers;
- make the go/no-go decision.

## Decision rule

**Proceed toward Paddle Live readiness** only if all minimum activity targets are met and at least 2
written purchase-intent statements qualify. This does not override the legal seller, legal policy,
privacy, support, provider, or Paddle verification gates.

**Iterate and validate again** when calls reveal a specific repeated problem but fewer than 2 people
will buy at the price. Change one major variable at a time: segment, message, workflow, or price.

**Do not open Live billing** when fewer than 5 qualified calls were completed, the positive signal
comes mainly from friends without the problem, required functionality does not exist, or nobody will
commit to the real price.

## Validation report

At the end, add a dated private report containing:

- tracker totals and conversion funnel;
- segment breakdown;
- number of qualifying purchase-intent statements by plan;
- top three repeated pains;
- top three objections and blockers;
- competing tools and current spend ranges;
- product or messaging changes supported by repeated evidence;
- explicit proceed, iterate, or stop decision;
- owners and due dates for the next gates.

Do not commit identifiable source material or written customer statements without permission. A
sanitized aggregate report may later be committed if it cannot identify a person or organization.
