# Processor agreement and region checklist

A worksheet for the ten providers in the [processor map](data-processors.md), all of which are
`Not verified` on both region and DPA today. This is the owner's task — it is done in provider
dashboards and contracts, not in this repository — and it blocks the privacy policy, the
[register](ropa.md), and the [DPIA](dpia.md) actions that depend on it.

Owner: `Unassigned`. Target date: `Unassigned`.

## How to record the answers

**Nothing collected here goes into this repository.** DPAs, dashboard exports, account identifiers
and correspondence belong in the private launch record. What comes back into the repo is one word
per cell in the processor map — the region, and `Signed` with a date — and nothing else.

Two rules that decide whether the work counts:

- **An API hostname is not a region.** `api.eu.assemblyai.com` proves which endpoint we call, not
  where the account stores data. The evidence is the dashboard setting or the contract term.
- **A DPA offered in a page footer is not a signed DPA** unless accepting the terms of service
  actually incorporates it. Where the provider requires a separate acceptance or signature, do that,
  and record the date and who accepted.

## The eight questions, for every provider

Ask each provider the same eight things. A provider that cannot answer one of them in writing is
itself the finding.

1. **DPA** — is a data processing agreement in force, on what date, and by what mechanism (signed
   document, or incorporated by the terms we already accepted)?
2. **Region** — where is the data stored, and where is it processed? Both, separately.
3. **Transfers** — if data leaves the EEA, on what basis (SCCs, adequacy decision, the provider's
   own binding rules), and is there a transfer impact assessment we can rely on?
4. **Subprocessors** — the current list, and how we are notified before it changes. Art. 28(2)
   requires either specific or general authorisation with a chance to object.
5. **Retention and deletion** — the provider's own retention for our data and for its logs, and
   whether deletion is contractual or best-effort.
6. **Breach notification** — does the contract oblige them to notify us without undue delay, and to
   which contact? Art. 33(2). Without this, our own [breach procedure](incident-response.md) has no
   input.
7. **Data subject requests** — are they obliged to assist us, and to act on an Art. 19 notice of
   erasure or rectification?
8. **Audit and security** — what Art. 28(3)(h) evidence is available: an audit right, a SOC 2, an
   ISO 27001 certificate?

Record for each provider: answers to 1–8, the date, where the evidence is filed, and who asked.

## Per provider

Grouped by how much is at stake if the answer is wrong.

### Tier 1 — they hold meeting content

These four hold or process the transcripts and audio. If any of them is wrong, the privacy policy is
wrong about the thing that matters most.

**Supabase** — the database and the audio bucket. Confirm the project region for *both* Postgres and
Storage; they are configured separately and can differ. Confirm backup location and backup
retention, since backups outlive our erasure. Confirm whether their DPA is in force by default or
needs acceptance.

**Recall** — records the meeting and returns the diarised transcript. Confirm the workspace region
against the deployed `RECALL_BASE_URL`, not instead of it. Confirm what happens to their copy of the
recording after we request deletion, and how long it survives if we never ask. Confirm their
subprocessor list — a bot joining a call is itself an integration chain.

**AssemblyAI** — in-room transcription. Production already refuses enablement unless the origin is
the EU one, so the remaining question is account provisioning: is the *account* EU, and is audio
retention configurable and set to the shortest option? Ask explicitly whether audio and transcripts
are used for model training, and get the answer in writing.

**Google (Gemini) and Anthropic** — transcript content is sent as prompt input. For both: processing
region and any regional endpoint controls; retention of prompts and outputs; whether input is used
for training; and whether a zero-retention arrangement is available on our plan. This is the shortest
path to reducing what the [DPIA](dpia.md) has to defend, because a provider that keeps nothing is a
provider that cannot leak it.

### Tier 2 — infrastructure and identity

**Railway** — deployment region, log retention, and who at the platform can access the container and
the injected production environment. It holds the database credentials, so its access model is part
of our security posture whether or not it reads a single row.

**Vercel** — deployment and edge regions, log retention, and whether any analytics that touches
visitor data is enabled outside this repository. If analytics is on, it is a processor nobody has
listed.

**Google (OAuth)** — separate from Gemini and worth asking separately: this is identity data, a
different purpose with a different basis.

### Tier 3 — email, telemetry, billing

**Resend** — region, and how long message content and delivery events are kept. Verification emails
contain a single-use URL; a provider that retains message bodies indefinitely is retaining that.

**Sentry** — project region, event retention, and the server-side scrubbing rules. Confirm that data
scrubbing is on and that no raw verification token or session token can reach it. Our own redaction
runs first, but defence in depth is the point.

**Paddle** — the different one. Paddle is merchant of record, so for the sale itself it is a
controller in its own right, not our processor, and it keeps statutory transaction records our
erasure cannot reach. Establish which of the two roles applies to which data, because the privacy
policy has to describe the split rather than call Paddle a processor and leave it there. While
`BILLING_MUTATIONS_ENABLED=false` no real transaction data exists yet, which makes this the cheapest
moment to get the description right.

## When a provider is unacceptable

Some answers should change the architecture rather than the paperwork. If a provider will not commit
to a region, will not commit to breach notification, or trains on our input with no opt-out, then the
options are to configure around it, to replace it, or to record an accepted risk with the adviser's
sign-off. Filing the answer and moving on is not one of the options.

## Done when

- All ten rows in the [processor map](data-processors.md) name a region and a DPA date.
- Third-country transfers and their safeguards are entered in [the register](ropa.md).
- Breach-notification contacts are recorded for the [breach procedure](incident-response.md).
- The privacy policy's residency and retention statements match the evidence, sentence by sentence.
- Any unused provider or credential is removed from production rather than documented.
