# Handling data subject requests (draft)

**Status: draft for the adviser. Not approved, and not yet operable — no owner is assigned and the
support address is not verified as monitored ([support email](support-email.md)).**

A data subject request is not a support ticket with a nicer name. Article 12(3) puts a one-month
clock on it that starts when the request arrives, wherever it arrives, however it is worded. This
document exists so the first one does not arrive to an empty chair.

Owner: `Unassigned`. Deputy: `Unassigned`. Until both are named, the process below is a plan, not a
control.

## 1. Two populations, one of which has no door

**Account holders** can be identified: they have an email address, a password, and a session. Most
of what they can ask for, they can already do themselves in settings.

**Meeting participants** cannot. They have no account, no login, and usually no idea that their
words are in our database. If one of them writes to us, we hold their speech and their name inside a
meeting owned by someone else, and every route we have for finding it starts from that owner.

This asymmetry is the hardest part of the whole procedure, and it is not solved by writing a nicer
process. It is a design consequence, recorded as risk R6 in the [DPIA](dpia.md). What the adviser
answers in DPIA §7 decides which of the following we owe:

- If the **organiser is the controller** and we are a processor: Article 28(3)(e) says we assist
  them; we do not answer the participant directly. We forward the request to the account holder and
  tell the participant we have done so. That answer needs to be honest about what it means — that
  their data sits with a customer of ours whom we will not name without a basis to.
- If **we are the controller**: we owe the participant a direct answer under Articles 15 and 17, and
  we need a way to find their data that does not require them to know which account holds it.
- If **joint controllers**: Article 26(3) lets the subject exercise rights against either of us
  regardless of what the arrangement says, so we must be able to answer either way.

Nothing below is safe to publish until that is settled.

## 2. Intake

| Channel | Status |
|---|---|
| Support address | `Unassigned` — the address exists in the plan but is not confirmed as monitored ([support email](support-email.md)) |
| In-product | Settings covers deletion; there is no "request my data" route |
| Postal | `Unassigned` |

Requests do not have to use a form, cite an article, or say "GDPR". A message that says *take my
stuff off your site* is an erasure request and the clock starts on it. Whoever monitors the inbox
needs to know that, which is a training item, not a code change.

**Log every request** — date received, channel, claimed identity, right invoked, action taken, date
answered. Article 5(2) accountability means the register is the evidence that the process ran. It
must live somewhere that is not this repository, because it contains personal data by definition.

## 3. Identity verification

Article 12(6) allows asking for more information where there is reasonable doubt, but it is not a
licence to demand documents. Asking a participant for an ID scan to prove they were in a meeting
would collect far more sensitive data than the request concerns, and would be a breach of
minimisation in its own right.

- **Account holder:** answering from the registered address, or acting from an authenticated
  session, is enough. Deleting the account already re-confirms the password (or, on
  `fix/security-compliance-hardening`, the account email for OAuth users who have no password).
- **Meeting participant:** verification is genuinely hard and must not become an excuse to stall.
  Practical approach — ask only for what narrows the search: an approximate date, the meeting
  platform, and the name they were labelled with. Never ask for identity documents. If doubt
  remains, Article 12(2) lets us decline where we genuinely cannot identify the person, but only
  after saying so and explaining why.

**Never collect an ID document, a bank detail, or a home address to process one of these.** That
rule holds even when the requester offers.

## 4. The rights, and what we can actually do today

### Access (Art. 15)

The subject may have a copy of their data and the information in Article 15(1) — purposes,
categories, recipients, retention, and the source. Most of that is answerable straight from
[the register](ropa.md) and [the processor map](data-processors.md).

**Gap:** there is no export endpoint. A subject access request today is assembled by hand from the
database, which is slow, error-prone, and requires production access — the very thing the hardening
work restricts. This is the main argument for building the export in Article 20's shape and using it
for both rights.

### Portability (Art. 20)

Applies to data the subject provided, processed by consent or contract, by automated means. For an
account holder that is the account details, meetings, transcripts and chat. Generated summaries and
documents are arguably not "provided by" them, but including them costs nothing and argues nothing.

**Gap:** not implemented. Format when built: JSON, one archive, machine-readable.

### Rectification (Art. 16)

A transcript is a record of what a provider heard, not a claim about the truth. If a subject says a
line is wrong, we do not silently rewrite the recording — we note the dispute alongside it and
correct what is factually correctable, such as a misattributed speaker name. Generated summaries are
a different matter: an LLM statement about a named person is our output, and if it is inaccurate,
Article 5(1)(d) means it gets corrected or removed.

**Gap:** no mechanism for either. Today this is a manual database edit.

### Erasure (Art. 17)

- **Account holder:** implemented. Settings deletes the account, and the service purges provider-side
  media, then chat, documents, transcripts, usage, meetings, sessions, and the user row, logging
  each step as the audit trail. On `fix/security-compliance-hardening` the Paddle customer identity
  is anonymised in the same pass, and provider erasure must be confirmed before the local rows go —
  so a failed remote delete no longer leaves an orphaned recording behind a deleted account.
- **Meeting participant:** no mechanism. Removing one speaker from a stored transcript is not a
  supported operation, and the audio it came from is normally gone within hours anyway.
- **Waitlist subscriber:** no mechanism at all. There is no account to delete, and nothing sweeps
  the table. Blocking before Live.

What erasure does **not** reach: Paddle's own records, which it keeps as merchant of record under
its statutory obligations; `email_send_ledger` rows, which survive with the user reference nulled;
and backups, which age out on their own schedule. All three must be stated in the privacy policy
rather than discovered by a subject.

### Objection (Art. 21)

Where we rely on legitimate interests — which is the draft basis for processing participants'
speech — the subject can object, and we must stop unless we show compelling grounds. In practice, a
participant objection is an erasure request with a different name, and it runs into the same missing
mechanism.

### Restriction (Art. 18)

No mechanism to mark a meeting as restricted-but-retained. The manual equivalent is to note the
restriction in the request log and not touch the data.

## 5. Deadlines

- Acknowledge without undue delay; answer within **one month** of receipt.
- Extendable by **two further months** for complexity, but only if the subject is told of the
  extension and the reason **within the first month**.
- Free of charge. A fee or refusal for manifestly unfounded or excessive requests is possible under
  Article 12(5), and the burden of showing that is ours.
- Refusals must state the reason, the right to complain to IMY, and the right to a judicial remedy.

## 6. Notifying recipients (Art. 19)

Rectification or erasure must be passed on to each recipient the data went to, unless that proves
impossible or disproportionate. For us that means the processors in [the register](ropa.md), and
whether their contracts oblige them to act on such a notice is `Not verified` for all ten. The
[DPA checklist](dpa-checklist.md) is where that gets established.

## 7. What has to be true before Live

| # | Item | Blocking? |
|---|---|---|
| 1 | Name an owner and a deputy for DSRs | Yes |
| 2 | Confirm the support address is monitored, and publish it ([support email](support-email.md)) | Yes |
| 3 | Adviser answers [DPIA](dpia.md) §7, so the participant path can be written down | Yes |
| 4 | Waitlist deletion and consent withdrawal | Yes |
| 5 | A request log that lives outside this repository | Yes |
| 6 | Merge `fix/security-compliance-hardening`, so OAuth-only accounts can be deleted at all and erasure covers billing identity | Yes |
| 7 | Export endpoint in Article 20 shape, serving both access and portability | No, but it is the difference between a process and a manual reconstruction |
| 8 | Confirm each processor is contractually obliged to act on an Art. 19 notice | No |

## References

- [GDPR Chapter III — rights of the data subject](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [IMY: de registrerades rättigheter](https://www.imy.se/privatperson/dataskydd/dina-rattigheter/)
- [EDPB guidelines 01/2022 on the right of access](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en)
