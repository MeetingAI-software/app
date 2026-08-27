# Withdrawal function — design (not implemented)

**Status: design draft for the adviser. Nothing here is built, and nothing here should be built
before the legal question in §1 is answered.** `LEGAL_WITHDRAWAL_FLOW_APPROVED` stays `false`.

Today the product does not operate a withdrawal function of its own. It links to Paddle Buyer
Support at `https://paddle.net` from the public footer, both language versions of the Refund Policy,
and authenticated Settings, and it says in both languages that a statutory withdrawal and a
voluntary refund are different requests. Paddle is Merchant of Record; it receives the request,
decides eligibility, and moves the money. That is deliberate, and the constraint that produced it
has not changed: **we must not build a parallel withdrawal-processing mechanism that bypasses
Paddle.** Any design here that touches money is out of bounds.

What is left, then, is a narrow question: does the trader owe the consumer a withdrawal *function*
on its own site, and an *acknowledgement* of the notice, that a hosted third-party flow does not by
itself discharge?

## 1. The question this document does not answer

Chapter 2, Section 10 a of the Swedish Distance Contracts Act requires a trader who lets consumers
conclude distance contracts online to provide a withdrawal function — a clearly labelled route by
which the consumer sends an unambiguous withdrawal notice, followed by an immediate acknowledgement
of receipt on a durable medium, stating when it was received.

Three things must be settled by the adviser before any code is written:

1. **Does the provision apply to this contract at all?** The rules were introduced for distance
   contracts for financial services. Whether a SaaS subscription sold through a merchant of record
   falls inside them is a legal reading, not an engineering one. If it does not, option A below is
   the whole answer and this document ends there.
2. **If it applies, who is the trader for it?** The consumer contracts with Paddle as merchant of
   record while using our application. If Paddle is the trader for this purpose, Paddle's flow is
   the function and our duty is to make it reachable and correctly labelled — which is what exists.
3. **Does the hosted flow discharge the duty?** [Legal pages](legal-pages.md) already lists the
   exact questions Paddle must confirm in writing: that its flow lets the buyer state the contract
   being withdrawn, requires an explicit final confirmation, and sends an immediate durable receipt
   containing the time it was received. **If Paddle answers yes to all of them, build nothing.**
   Option B below exists only for the case where Paddle answers no, or does not answer.

## 2. Option A — reachability only (current behaviour, recommended default)

We add nothing. The obligation is met by Paddle's flow, and our responsibility is that the route to
it is unmistakable and honest.

What would still need work under this option is text and evidence, not features:

- the label must say *withdrawal*, distinctly from *refund*, everywhere it appears — already true in
  the Terms, the Refund Policy, and Settings;
- the pages must say plainly that submitting a request is not itself approval — already true;
- Paddle's written confirmation must be on file against the exact deployed commit, and stored in the
  private launch record rather than in this repository.

**Cost: zero. Risk: entirely dependent on Paddle's answer.** Recommend adopting this and treating
option B as contingency.

## 3. Option B — a thin withdrawal notice, if the duty is ours

Only if §1 lands the duty on us. The design principle is a hard line: **we receive and acknowledge a
notice; Paddle decides and pays.** We never state eligibility, never promise a refund, never open a
case Paddle does not know about.

### 3.1 Flow

1. The consumer opens the withdrawal function from Settings, the footer, or the Refund Policy. It is
   a distinct control, never a variant of "cancel subscription" and never labelled "refund".
2. A page shows their purchase as we already hold it — subscription, plan, purchase date, billing
   email — and asks them to confirm it is the contract being withdrawn.
3. A final, explicit confirmation step. One unambiguous action, no pre-ticked boxes, no bundling
   with a cancellation.
4. On submit, the notice is recorded with a server-side timestamp and the acknowledgement is sent.
5. The consumer is then handed to Paddle Buyer Support to complete the request, with the same
   wording that already tells them what Paddle does and does not decide.

Step 5 is what keeps this inside the constraint: the function receives a notice, and Paddle remains
the only place money moves.

### 3.2 Identifying the purchase

We already mirror Paddle state in `paddle_customers` and `paddle_subscriptions`, and a signed-in
consumer's subscription is therefore identifiable without asking them for anything. That path is the
easy one, and the only one to build first.

A consumer who cannot sign in is harder, and the honest design answer is not to solve it here: send
them to Paddle, which can identify the purchase from the billing email. Building an unauthenticated
notice form invites exactly the parallel mechanism we are forbidden to build, and it would collect
personal data from anyone who fills it in, whether or not they ever bought anything.

### 3.3 Data model

One table, deliberately thin. Names below are illustrative; nothing is migrated.

| Column | Why it exists |
|---|---|
| `id` | Primary key |
| `user_id` | The account that sent the notice; nulled on erasure, the way the send ledger is |
| `subscription_id` | Which contract is being withdrawn |
| `received_at` | Server clock, never the client's. This is the timestamp the acknowledgement quotes and the only legally load-bearing field |
| `acknowledgement_sent_at` | Evidence the receipt actually went out |
| `notice_version` | Which version of the withdrawal text the consumer saw, the way the recording notice is versioned |
| `locale` | Which language the acknowledgement was sent in |

What is deliberately **not** stored: no reason, no free-text field, no eligibility determination, no
outcome, no refund amount, no correspondence. A free-text box would collect whatever the consumer
chooses to type, and none of it is needed to make the notice unambiguous. An outcome column would be
us keeping a shadow case record of a decision that is Paddle's.

### 3.4 The acknowledgement

Sent immediately, on a durable medium, in the consumer's language. Durable means it survives outside
our session: an email through Resend, plus the same text rendered on screen so it can be saved or
printed. It must state that the notice was received, the time it was received, and which contract it
concerned — and it must say, in terms, that receipt is not a decision.

If the email send fails, the notice is still received and still recorded. The screen text is the
fallback receipt, and the failure is logged so it can be resent. The one thing that must never
happen is the notice being rejected because the receipt could not be sent.

### 3.5 Copy

Draft, for the adviser to correct. Both languages ship together or neither ships.

**Swedish**

> **Ångra ditt köp**
> Ånger enligt lag är inte samma sak som en frivillig återbetalning. Här skickar du ett meddelande om
> att du vill ångra köpet nedan. Paddle, som är säljare (Merchant of Record), tar emot och handlägger
> begäran och beslutar om ångerrätten gäller.
>
> Avtal: {plan}, köpt {datum}
>
> [ Bekräfta att jag ångrar köpet ]

Acknowledgement:

> Vi tog emot ditt meddelande om ånger {datum och tid} för {plan}, köpt {datum}. Det här är ett
> mottagningsbevis, inte ett beslut. Paddle handlägger begäran och återkommer till dig.

**English**

> **Withdraw from your purchase**
> A statutory withdrawal is not the same as a voluntary refund. Here you send notice that you are
> withdrawing from the purchase below. Paddle, as Merchant of Record, receives and handles the
> request and decides whether the withdrawal right applies.
>
> Contract: {plan}, purchased {date}
>
> [ Confirm that I am withdrawing ]

Acknowledgement:

> We received your withdrawal notice at {date and time} for {plan}, purchased {date}. This is an
> acknowledgement of receipt, not a decision. Paddle handles the request and will come back to you.

Two rules for whoever edits this text: the word *withdrawal* and the word *refund* never stand in for
each other, and nothing in it may read as a promise of money.

### 3.6 Accessibility

The function is a form, and the ordinary rules are the whole requirement: a real `<form>` with a
real submit button rather than a click handler on a `<div>`; a visible label on the confirmation
control that says what it does out of context, not "Confirm"; the confirmation step reachable and
operable by keyboard alone in a sensible order; the acknowledgement announced to assistive
technology and not only rendered visually; contrast that meets WCAG 2.2 AA; and no reliance on
colour alone to distinguish withdrawal from refund. The existing footer link already carries an
`aria-label` that names the destination, which is the pattern to follow.

### 3.7 Retention

The notice is a record of a legal act, so it is not swept with operational data, and it is not
deleted on account deletion the way meetings are — `user_id` is nulled and the row remains, exactly
as `email_send_ledger` handles the same tension. How long it must remain is a legal question tied to
limitation periods and to Paddle's own record keeping; `Unassigned` until the adviser sets it.
Whatever they set goes into [the register](ropa.md) as a new activity and into
[data retention](data-retention.md) as a new row. The legal basis would be Art. 6(1)(c), a legal
obligation.

## 4. What must not be built

- No refund processing, no payment mutation, no crediting — Paddle only.
- No eligibility logic. We never compute or display whether a withdrawal applies.
- No shadow case record: no status field, no outcome, no correspondence thread.
- No unauthenticated notice form.
- No free-text reason box.
- No bundling of withdrawal into the cancel-subscription flow.

## 5. Decision path

| # | Step | Owner |
|---|---|---|
| 1 | Adviser answers §1.1 — does the provision apply to this contract | `Unassigned` |
| 2 | Paddle confirms in writing the questions in [legal pages](legal-pages.md) | `Unassigned` |
| 3 | If both point at Paddle: adopt option A, keep this document as the record of why | `Unassigned` |
| 4 | If the duty is ours: adviser reviews §3 including the copy, then implementation is scoped as its own change with its own migration and tests | `Unassigned` |
| 5 | `LEGAL_WITHDRAWAL_FLOW_APPROVED=true` only after 1–3, or 1–4, are complete and reviewed against the exact deployed commit | `Unassigned` |

## References

- [Legal pages and the publication gate](legal-pages.md)
- [Konsumentverket on the online withdrawal function](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/)
- [Distansavtalslagen (2005:59)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-200559-om-distansavtal-och-avtal-utanfor_sfs-2005-59/)
