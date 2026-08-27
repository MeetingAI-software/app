# Data protection impact assessment (draft)

**Status: draft for the adviser. Not approved, not signed, not a completed DPIA.**

This is an engineering-authored first draft of the Article 35 assessment for Syncmemos. It exists so
that the adviser meeting starts from written facts about the system instead of a whiteboard. Every
statement about our own code is verifiable in this repository; every statement about a provider's
configuration is marked `Not verified` and must be established from the provider dashboard or
contract before Live.

Two things this draft cannot settle, and deliberately does not pretend to:

- **Who the controller is.** No legal seller has been selected yet
  ([legal seller readiness](legal-seller-readiness.md)). Until one is, the controller entry below is
  a placeholder.
- **The controller/processor split for meeting content.** The organiser chooses to record a meeting
  with people who are not our users. Whether Syncmemos is a controller, a joint controller, or a
  processor for that content is the single most consequential legal question in this document, and
  it is the adviser's to answer. Section 7 sets out what changes under each answer.

Owner: `Unassigned`. Review date: `Unassigned`.

## 1. Is a DPIA required?

Article 35(1) requires one where processing is "likely to result in a high risk". Article 35(3)(b)
names large-scale processing of special-category data, and (a) names systematic evaluation. Neither
subparagraph is a clean fit — the scale is currently zero users, and we do not process special
categories deliberately.

The trigger here is the combination the EDPB criteria describe rather than any single item:

| Criterion (WP248 rev.01) | Present | Why |
|---|---|---|
| Evaluation or scoring | Partly | LLMs generate summaries and documents *about* named participants from what they said. |
| Data processed on a large scale | Not yet | Pre-launch. Re-assess at launch and at each order of magnitude. |
| Data concerning vulnerable data subjects | Yes | Meeting participants are not our users, have no account, and did not choose the tool. |
| Innovative use of technology | Yes | Automated diarised transcription plus generative summarisation of speech. |
| Data preventing subjects from exercising a right | Yes | A participant with no account has no route to their own data — see [DSR procedure](data-subject-requests.md). |
| Sensitive or highly personal data | Yes, in effect | We do not select for it, but what people say in meetings is not filtered. Health, union, and legal matters arrive in transcripts because that is what meetings are about. |

Five criteria met. Our own retention policy already states the conclusion in its own words:
[data retention](data-retention.md) describes meeting audio as "a biometric-adjacent recording of
identifiable people who did not all individually consent to us holding it". That sentence is a DPIA
trigger written down before anyone called it one.

**Draft conclusion: a DPIA is required.** The adviser should confirm, and should confirm whether
IMY's list of processing requiring a DPIA adds anything specific here.

A note on "biometric-adjacent": speech recordings are not automatically Article 9 biometric data.
They become biometric data when processed *for the purpose of* uniquely identifying a person.
Recall's diarisation labels speakers within one meeting; it does not build a cross-meeting
voiceprint, and we do not ask it to. The adviser should confirm that reading, because it decides
whether Article 9 applies at all.

## 2. Description of the processing

### What the product does

A user connects a meeting (a bot joins the call) or uploads an in-room recording. The audio is
transcribed with speaker labels, an LLM produces a summary and a structured document, and the user
can ask questions about the meeting in a chat grounded in the transcript. A meeting can optionally
be shared through an expiring public link.

### Data subjects

1. **Account holders** — the paying user. Registers with an email address or Google OAuth.
2. **Meeting participants** — everyone else in the call or the room. No account, no relationship
   with us, often no awareness of us. This is the group the assessment is really about.
3. **Waitlist subscribers** — pre-launch visitors who left an email address.
4. **Recipients of a share link** — anyone the account holder sends a transcript to.

### Categories of personal data

| Category | Where | Source |
|---|---|---|
| Email address, password hash, Google `sub`, verification state | `users` | Account holder |
| Session token hashes, expiry | `sessions` | Derived |
| Meeting URL, platform, timing, participant names, share token | `meetings` | Account holder + provider |
| Speech content with speaker labels and timestamps | `transcripts`, `live_transcript_segments` | All participants |
| Raw provider response for the transcript | `transcripts.raw_payload` | Provider |
| LLM-generated summaries and documents about what people said | `documents`, `meetings.summary` | Derived from the above |
| Questions and answers about a meeting's content | `chat_messages` | Account holder + derived |
| Recorded seconds per meeting | `usage_ledger` | Derived |
| Billing customer id, email, subscription state | `paddle_customers`, `paddle_subscriptions` | Paddle |
| Verification-email send events | `email_send_ledger` | Derived |
| Raw provider webhook payloads, including transcript content | `webhook_events` | Provider |
| Waitlist email address and which dialog it came from | `waitlist_signups` | Visitor |
| Meeting audio (temporary) | Supabase Storage | Account holder / provider |

Special categories are not collected by design but are not excluded in practice: a recorded meeting
can contain anything the participants say. The mitigation is not filtering — it is the short audio
life, the deletion path, and the access controls in section 6.

### Purposes and legal bases (draft — adviser to confirm)

| Purpose | Data | Draft legal basis | Note |
|---|---|---|---|
| Provide the account | `users`, `sessions` | Art. 6(1)(b) contract | Straightforward. |
| Transcribe, summarise and answer questions about a meeting | audio, transcripts, documents, chat | 6(1)(b) toward the account holder; **6(1)(f) toward other participants** | The balancing test for the second half is the core of section 7. |
| Bill the subscription | Paddle mirror | 6(1)(b), plus 6(1)(c) for the statutory records Paddle keeps as merchant of record | Paddle's own retention is outside our erasure. |
| Prevent verification-email abuse | `email_send_ledger` | 6(1)(f) | Detached from the user on erasure. |
| Security and error telemetry | Sentry events | 6(1)(f) | |
| Waitlist | `waitlist_signups` | 6(1)(a) consent | **Gap: no withdrawal mechanism, no retention period, no deletion path.** See section 8. |

### Recipients

Railway, Vercel, Supabase, Recall, AssemblyAI, Google (Gemini and OAuth), Anthropic, Resend, Sentry,
Paddle. Purpose, data, region, retention and DPA status per provider are in the
[processor map](data-processors.md). Ten of ten are `Not verified` on both region and DPA today —
that is itself a finding of this assessment, not a footnote.

### Transfers outside the EU/EEA

`Not verified` for every provider. Anthropic and Google are US-headquartered; AssemblyAI is
configured so that production refuses in-room recording enablement without the exact EU API origin,
but account provisioning is a dashboard fact we cannot prove from code. Until each provider's region
and transfer mechanism is documented, **the privacy policy cannot state a residency claim** — that
rule is already written into the processor map and must survive into the published text.

### Retention

Documented in [data retention](data-retention.md), enforced by the sweep job, evidenced by its logs.
Audio is deleted 1 hour after transcription (in practice within roughly 7 hours, because the sweep
runs every 6). Everything else meeting-related lives until account deletion.

## 3. Necessity and proportionality

**Is the processing necessary for the purpose?** Yes for the transcript, which is the product.
Less obviously so for everything derived from it: the audio, the raw provider payload, and the
generative output all exist for convenience or reprocessing rather than for the stated service.

The design already reflects that:

- Audio is deleted an hour after it has served its only purpose, on both recording paths, and the
  reason is written down: the transcript is the source of truth from the moment it exists.
- Live transcript segments are deleted when the final transcript lands.
- Processed webhook payloads are replaced with a redaction marker once the worker no longer needs
  them (on `fix/security-compliance-hardening`, not yet on `main`).
- Production data is never copied into development, and the API refuses to start against a remote
  database from a terminal.

**What is not minimised:** `transcripts.raw_payload` keeps the provider's complete response
indefinitely alongside the parsed `segments`. Its purpose is reprocessing. That is a real purpose,
but it means a second full copy of everything said in the meeting persists for the life of the
account. The adviser should be told this plainly; the engineering options are to drop it after a
bounded period or to store only the fields reprocessing actually needs.

## 4. Consultation

- Data subjects: not consulted. For meeting participants there is no channel to consult them
  through, which is itself the point section 7 makes.
- Adviser: pending — this document is the input to that meeting.
- Supervisory authority (IMY, Art. 36 prior consultation): only required if high residual risk
  cannot be mitigated. Draft view: not required, on the assumption that section 6 and section 8's
  measures are accepted. The adviser decides.
- DPO: none appointed. Article 37 does not obviously require one at this scale, but "regular and
  systematic monitoring on a large scale" is a judgement the adviser should make explicitly rather
  than by default.

## 5. Risks to data subjects

Scored as likelihood times severity for the *data subject*, not for the business.

| # | Risk | Likelihood | Severity | Inherent |
|---|---|---|---|---|
| R1 | A participant's speech is recorded, transcribed and stored without them knowing or being able to object | High | High | **Critical** |
| R2 | A share link is forwarded beyond its intended recipient | Medium | High | **High** |
| R3 | A provider retains audio or transcript longer than we believe, or in an undocumented region | Medium | High | **High** |
| R4 | An LLM summary states something inaccurate about an identified person and is acted on | Medium | Medium | Medium |
| R5 | Transcript content leaks through raw provider payloads that outlive their purpose | Medium | High | **High** |
| R6 | A participant cannot exercise access or erasure because they have no account and no route in | High | Medium | **High** |
| R7 | Prompt injection from meeting speech steers the model into disclosing other content | Low | Medium | Medium |
| R8 | Waitlist addresses are kept indefinitely with no withdrawal path | High | Low | Medium |
| R9 | Account holder credentials are compromised, exposing every meeting they hold | Low | High | Medium |

## 6. Measures already implemented

Verifiable in the repository today. A flagged row (⚑) is implemented on
`fix/security-compliance-hardening` and is **not yet in production**.

| Risk | Measure |
|---|---|
| R1 | ⚑ Server-stamped recording-notice confirmation per meeting, versioned, required as a header before any upload is buffered. It evidences that the organiser affirmed the notice — not that participants were actually told. |
| R2 | ⚑ Sharing is opt-in, time-boxed and revocable; the share page is `no-store` and `noindex`; the database, not the route, enforces expiry. |
| R3 | Documented processor map; production refuses in-room recording enablement without the exact AssemblyAI EU origin. Region and DPA remain `Not verified`. |
| R4 | Generated documents are presented as meeting output, not as fact about a person. No automated decision with legal effect is taken. |
| R5 | ⚑ Processed webhook payloads are redacted to a marker; audio is deleted an hour after transcription on both paths; ⚑ failed meetings' audio is swept rather than kept forever. |
| R6 | Nothing implemented. See section 8. |
| R7 | ⚑ Untrusted transcript content is isolated from instructions at the prompt boundary. |
| R8 | Nothing implemented. See section 8. |
| R9 | Hashed sessions with a 30-day TTL, hashed passwords, ⚑ OAuth `state`, email verification, per-route rate limits, ownership enforced in the database. |

Organisational measures that exist as documents rather than code: the retention schedule and its
log-based evidence, the fail-closed legal publication gate, the production-hardening runbook, and
the rule that no personal data enters this repository.

## 7. The unresolved question, stated for the adviser

The organiser presses record. The other four people in the call are recorded, transcribed, labelled
by speaker, summarised by a language model, and stored on our infrastructure until the organiser
deletes their account. They were told by the organiser — or they were not; we cannot know. They have
no account, no notice from us, and no way to ask us anything.

Three readings, each with a different bill:

1. **Syncmemos is a processor for the organiser as controller.** Then the organiser owes the
   participants notice and rights, and we owe the organiser an Article 28 processor agreement, which
   we do not have and do not currently offer. Our terms would need to carry one.
2. **Syncmemos is a controller for meeting content.** Then we owe the participants Article 14
   information — from a party they have never heard of — and a rights channel. Article 14(5)(b)
   disproportionate-effort relief is arguable; it is not automatic, and it comes with conditions.
3. **Joint controllership.** Then Article 26 requires a transparent allocation of responsibilities
   and a public essence of the arrangement.

Our recording-notice mechanism affirms that the organiser confirmed a notice. It does not evidence
that participants were informed, and the security audit says so in as many words. Whatever the
adviser answers, the answer changes product text, the terms, and possibly the notice flow — which is
why it belongs at the top of the agenda, not at the end.

## 8. Actions required before Live

| # | Action | Owner | Blocking? |
|---|---|---|---|
| A1 | Adviser answers section 7 and confirms section 1's Article 9 reading | `Unassigned` | Yes |
| A2 | Region, transfer mechanism and DPA for all ten providers ([DPA checklist](dpa-checklist.md)) | `Unassigned` | Yes |
| A3 | A route for a participant with no account to reach us ([DSR procedure](data-subject-requests.md)) | `Unassigned` | Yes |
| A4 | Waitlist: retention period, deletion path, and a withdrawal mechanism for the consent | `Unassigned` | Yes |
| A5 | Decide the fate of `transcripts.raw_payload` — bounded retention or reduced fields | `Unassigned` | No |
| A6 | Retention and erasure for `webhook_events` rows that never process successfully | `Unassigned` | No |
| A7 | Merge `fix/security-compliance-hardening`, so the flagged measures above are real in production | `Unassigned` | Yes |
| A8 | Re-assess this DPIA at launch and whenever a provider, model, or recording path changes | `Unassigned` | — |

## 9. Draft residual risk

With A1–A4 and A7 complete, the draft view is that residual risk is acceptable and Article 36 prior
consultation is not required. Without them — in particular with R1 and R6 unmitigated — it is not,
and no amount of code closes that gap. The adviser owns this conclusion; we own the evidence for it.

## References

- [GDPR Article 35](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [WP248 rev.01 — DPIA guidelines](https://ec.europa.eu/newsroom/article29/items/611236)
- [IMY: konsekvensbedömning och förhandssamråd](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning-och-forhandssamrad/)
