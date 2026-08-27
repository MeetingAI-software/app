# Personal data breach procedure (draft)

**Status: draft for the adviser. Not approved, and not exercised. Owner: `Unassigned`.**

Article 33 gives the controller 72 hours from becoming aware of a personal data breach to notify the
supervisory authority. Seventy-two hours is not long enough to decide who is in charge, find the
supervisory authority's form, and work out whether a deleted file counts. That is the whole reason
this document exists before we have users.

## 1. What counts as a breach

Article 4(12): a breach of security leading to accidental or unlawful destruction, loss, alteration,
unauthorised disclosure of, or access to personal data. Three kinds, and only one of them is what
people picture:

- **Confidentiality** — someone saw data they should not have. A share link indexed, a transcript
  returned to the wrong account, a leaked key, a provider incident.
- **Integrity** — data altered without authorisation.
- **Availability** — data destroyed or lost, including by us, including accidentally.

That last one is not hypothetical here. On **2026-08-08** the retention sweep was run against
production from an unmanaged laptop and destroyed seven meetings' audio. That is a personal data
breach of the availability type. It happened before we had users, so there were no data subjects to
notify and no controller to notify from — but the same command run after Live would have started the
72-hour clock, and the honest read is that we would not have recognised it as a breach at the time.
The boot guard that now refuses a remote database from a terminal is the fix; this document is the
part of the fix that is not code.

The 2026-08-06 Actions outage, by contrast, was not a breach: a merge produced no CI run, which is a
delivery failure with no effect on personal data. Keeping the distinction sharp matters in both
directions — under-reporting is a violation, and reflexively reporting every outage burns the
authority's attention and our own.

## 2. Roles

| Role | Who | Does what |
|---|---|---|
| Incident lead | `Unassigned` | Owns the incident end to end, makes the notify/do-not-notify call, keeps the log |
| Technical responder | `Unassigned` | Contains, investigates, preserves evidence |
| Communications | `Unassigned` | Writes to data subjects and answers what comes back |
| Adviser | `Unassigned` | Consulted on notification and on wording before anything is sent |

At current size these collapse to one person. That is acceptable only if the person is named. An
unassigned incident lead means the 72 hours are spent deciding who decides.

## 3. When the clock starts

At **awareness** — the moment there is a reasonable degree of certainty that a security incident
occurred that compromised personal data. Not at the moment the investigation finishes. A credible
report from a user or a researcher starts it; so does a provider telling us they were breached.

A short verification period is allowed before awareness is established, but it must be short, and
it must be logged. "We were still looking into it" is not a defence for day four.

## 4. Steps

### Step 1 — Contain (immediately)

Stop the bleeding before understanding it. Depending on the kind: revoke the exposed credential and
rotate it in the platform environment; disable the affected share links; take the affected route out
of service; revoke sessions. Containment beats diagnosis — a leaked key is rotated first and
understood second.

### Step 2 — Preserve evidence

Do not clean up before capturing state. Logs, timestamps, the deploy SHA, the affected row ids, the
provider's own incident reference. The retention sweep and the erasure path both log every step
specifically so that after-the-fact reconstruction is possible; that only works if nobody rotates
the logs away first.

### Step 3 — Assess (Art. 33(3))

Establish and write down:

- **Nature** of the breach and which of the three kinds it is.
- **Categories and approximate number of data subjects** — account holders only, or meeting
  participants who never chose us? The second is materially more serious.
- **Categories and approximate number of records** — transcripts and audio are the crown jewels
  here; a leaked verification-send ledger is not in the same class.
- **Likely consequences** for the subjects.
- **Measures taken or proposed**, including mitigation.

Assess risk from the **subject's** side. The severity question for a transcript leak is not what it
costs us; it is that the content of someone's meeting — which may include health, employment, or
legal matters nobody chose to disclose to us — is now outside our control, and the person affected
may not even be our user.

### Step 4 — Notify the supervisory authority (Art. 33)

Notify **IMY within 72 hours** unless the breach is unlikely to result in a risk to rights and
freedoms. If the conclusion is not to notify, **write down the reasoning at the time** — Article
33(5) requires the documentation regardless of the outcome, and a decision reconstructed later is
worth much less than one recorded on the day.

If not all facts are available, notify anyway and supplement in phases. Article 33(4) expressly
allows it. Late and complete is worse than prompt and partial.

Which authority is IMY depends on the controller being established in Sweden, which is
`Unassigned` — see [legal seller readiness](legal-seller-readiness.md). If the seller ends up
established elsewhere, the lead authority changes with it, and so does the form on Step 4. That is
another reason the seller decision blocks more than the invoice footer.

### Step 5 — Notify the data subjects (Art. 34)

Required without undue delay where the breach is likely to result in a **high** risk to their rights
and freedoms. A transcript disclosure would plainly qualify. Article 34(3) exemptions — strong
encryption, subsequent measures making the risk unlikely, or disproportionate effort permitting a
public communication instead — are narrow, and the burden is ours.

The communication must be in clear plain language and must state the nature of the breach, a contact
point, likely consequences, and the measures taken. Not a legal notice, not a marketing apology.

**For meeting participants we cannot do this.** We have their names inside a transcript and no
contact details, no account, and no relationship. The only route to them is the account holder who
recorded them. This is the same wall as risk R6 in the [DPIA](dpia.md) and the participant path in
the [DSR procedure](data-subject-requests.md), and it will have to be answered as a public
communication under Article 34(3)(c) plus notification to affected account holders.

### Step 6 — Record it (Art. 33(5))

Every breach goes in the register, notified or not: facts, effects, remedial action, and the
reasoning behind the notification decision. The register holds personal data, so it lives outside
this repository. `Unassigned`.

### Step 7 — Learn

A written post-incident note: what happened, what made it possible, what change prevents a repeat,
and who owns that change. The 2026-08-08 sweep produced exactly that outcome — a boot guard — but
produced it informally. Next time it is written down.

## 5. If a processor is breached

Article 33(2) requires the processor to notify us without undue delay; our 72 hours then start at
their notification. That obligation only exists if the contract says so — and DPA status is
`Not verified` for all ten providers ([processor map](data-processors.md)). Today, if a provider
were breached, we would most likely find out from their status page.

Establishing the notification obligation, and a contact for it, is part of the
[DPA checklist](dpa-checklist.md).

## 6. Before Live

| # | Item | Blocking? |
|---|---|---|
| 1 | Name the incident lead and a deputy | Yes |
| 2 | Confirm which supervisory authority applies, once the seller is chosen | Yes |
| 3 | A breach register outside this repository | Yes |
| 4 | Processor breach-notification obligations and contacts confirmed | Yes |
| 5 | Know before the day where IMY's notification form is and what it asks | No |
| 6 | Walk one tabletop scenario — the leaked share link is the cheapest realistic one | No |

## References

- [GDPR Articles 33 and 34](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [IMY: anmäl en personuppgiftsincident](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/anmal-personuppgiftsincident/)
- [EDPB guidelines 9/2022 on personal data breach notification](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en)
