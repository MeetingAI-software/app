# Withdrawal function — design draft

**Draft for qualified legal and product review, updated 2026-09-11. No withdrawal-processing
function is implemented by this document.** Keep `LEGAL_WITHDRAWAL_FLOW_APPROVED=false`
until an authorized review establishes the applicable duty and verifies the actual flow.
This work does not implement refunds, payment mutations or a parallel case platform.

## Current behavior

The footer, Settings and the Refund Policy link to [Paddle Buyer Support](https://paddle.net).
Existing Swedish/English text distinguishes statutory withdrawal from a voluntary refund and
says that sending a request is not approval. Paddle handles payment-side processing as Merchant
of Record. A support link by itself is not evidence that the required online withdrawal function,
confirmation or durable acknowledgement exists or satisfies a particular trader's duty.

## Applicable rule and open assessment

The online withdrawal-function rules are **not limited to financial services**.
Konsumentverket's guidance describes the change effective 19 June 2026 for online consumer
contracts where a statutory right of withdrawal applies, and distinguishes acknowledgement of
receipt from approval. [Konsumentverket, published 8 June 2026](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/).

Our specific assessment remains open. The owner and adviser must establish:

- Whether the actual offer is B2B, B2C or mixed; the consumer contract, service/digital-content
  classification and any applicable withdrawal exceptions. A SaaS label alone settles none of these.
- Which legal entity is the trader for the relevant obligation, given the actual Paddle agreement,
  checkout, receipts and our online interface. Merchant-of-record terminology does not replace
  that analysis or automatically remove our responsibilities.
- Whether the reachable hosted flow provides the required information, explicit submission and
  immediate acknowledgement on a durable medium, including the notice content and receipt date/time.
- Whether access remains effective when the buyer is signed out, cannot recover an account or has
  already deleted it. An authenticated-only route must not frustrate a statutory right.

Review the current [Distance Contracts Act](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-200559-om-distansavtal-och-avtal-utanfor_sfs-2005-59/)
and the concrete contracts. Do not rely on the previous draft's financial-services-only reading
or its unverified section reference.

## Option A — rely on a verified hosted flow

Retain the existing links if the qualified assessment and provider evidence establish that this
arrangement meets every applicable duty. This is a conditional design option, not a compliance
conclusion, a cost estimate or approval to enable the gate.

Obtain Paddle's written response to the questions in [legal pages](legal-pages.md). Test the real
buyer journey and sample acknowledgement in an approved environment, including accessibility,
contract identification and signed-out recovery. Record which entity receives a legally effective
notice and what happens when email delivery fails. Keep private evidence tied to the reviewed
commit and policy version. If any required part is missing, keep the gate closed and scope the
necessary change separately.

## Option B — scoped notice receipt, only after a responsibility decision

If the duty requires an application change, draft it with Paddle and the adviser before
implementation. Receiving notice and acknowledging it is distinct from deciding a refund or
moving money. Handoff to support must not misleadingly require the buyer to submit the same
withdrawal again to make an already valid notice effective.

A future design would need:

1. A clearly labelled, reachable withdrawal route separate from cancellation and voluntary refunds.
2. Proportionate contract identification, including an accessible path for buyers who cannot sign in.
3. An explicit final submission and a reliable record of the notice and its time of receipt.
4. Immediate acknowledgement using a verified durable medium, with the notice content and
   date/time. A transient on-screen message or a print button is not assumed to satisfy this.
5. A defined failure/retry process for receipt delivery, with no false claim that an email was sent
   merely because a queue accepted it, and no silent loss of an already received notice.
6. An agreed transfer of the notice to the responsible party and a clear buyer-facing explanation.

Paddle handles its payment-side assessment and settlement; application text must not imply that a
provider's discretion creates or extinguishes statutory rights. Receipt is not approval and is not
a promise of a refund.

## Data, accessibility and retention decisions before implementation

No table or migration is proposed for this merge. If a notice record later proves necessary,
justify the minimal fields, access controls, acknowledgement evidence and retention period against
the actual obligation. A server timestamp alone is not the whole legal record. Removing a user
foreign key while retaining subscription/provider identifiers does not automatically anonymize it.
Article 6(1)(c) is only a candidate basis where a specific applicable legal obligation has been
identified; determine the basis and record it in [RoPA](ropa.md).

Test keyboard navigation, meaningful labels, screen-reader feedback, contrast and error recovery
across the complete hosted/application flow. Ordinary form semantics are useful implementation
requirements, not proof of complete accessibility compliance.

Do not collect unnecessary free text, reasons, identity documents or a duplicate support thread.
Do not add eligibility calculations, refunds, credits or payment mutations in this project.
The future scope must respect both effective consumer access and data minimization; omitting a
necessary signed-out path is not an acceptable shortcut.

## Decision record to complete privately

| Decision / evidence | Responsible role | Current status |
|---|---|---|
| Actual B2B/B2C offer, contract classification and applicable duty | Owner + adviser | Not verified |
| Responsible trader/entity and hosted-flow responsibility | Owner + adviser + Paddle | Not verified |
| End-to-end function, explicit submission, durable receipt and recovery evidence | Owner + engineering + Paddle | Not verified |
| Any required application change, data basis/retention and accessibility | Adviser + engineering | Not scoped or approved |
| Reviewed policy version and permission to enable the gate | Accountable owner | Not approved by this document |

Named owners are Unassigned. Provider correspondence stays outside Git. The historical
[launch plan](launch-plan.md) (preserved by PR77) is context; the [handoff](launch-handoff.md) and
[legal publication gate](legal-pages.md) describe current readiness.
