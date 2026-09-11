# Handling data subject requests (draft)

**Draft, updated 2026-09-11. Not approved or exercised. Owner and deputy: Unassigned.**
A monitored support address and restricted request record are not verified. This is a proposed
process and inventory of code capabilities, not a claim that all rights are currently operable.

## 1. Account holders and other affected people

An account can help locate data but is not a prerequisite for GDPR rights. Meeting participants,
waitlist subscribers and visitors may be affected without ever registering or paying. Determine
our role for the relevant purpose, using the factual assessment in [DPIA §7](dpia.md):

- As controller, assess and respond to the request and protect other people's rights.
- As processor, promptly assist the responsible controller under applicable instructions and
  Article 28 arrangements. Explain the route to the requester where appropriate; do not
  automatically disclose the request or other personal data to an unverified organizer.
- Joint-controller arrangements do not prevent a person exercising rights against either
  controller under Article 26(3).

The role question needs resolution, but existing requests must be handled promptly while facts
are established. A missing seller field or pre-launch status does not suspend duties.

## 2. Intake, ownership and deadlines

Accept requests through available channels; a particular form or citation of GDPR is not required.
Record receipt, claimed identity, scope, responsible role, verification steps, deadlines, actions
and response in restricted storage outside Git. Route ambiguous requests for clarification without
using that as an excuse to stall.

Respond without undue delay and ordinarily within one month of receipt. Where the permitted
complexity/number-of-requests extension is needed, explain it and the reasons within the first
month; the extension can be up to two additional months. Fees/refusals require the applicable
grounds and evidence. A refusal must explain the decision and complaint/judicial-remedy options,
identifying the competent authority rather than assuming IMY in all cases.
[IMY: rights and deadlines](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/).

## 3. Proportionate identity verification

A registered email or authenticated session is useful evidence, not invariably sufficient for
every sensitive disclosure or destructive operation. Assess reasonable doubt, the data requested
and the consequences. Prefer established secure channels and the least additional information
necessary. Approximate date/platform/speaker context may help locate a participant's data but
does not by itself prove entitlement to the whole meeting.

Do not routinely solicit ID scans, bank details or home addresses, and never put identity evidence
in this repository. Article 12(6) permits necessary supplementary information where there are
reasonable doubts; it is not a general document requirement. Any exceptional verification method
needs a justified, secure, proportionate process. If identification remains impossible, assess
the applicable Article 11/12 conditions, explain the limitation and consider further information
the person supplies. [IMY: identification](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/identifiering/).

### Implemented self-service deletion identity check after PR75

Password accounts reconfirm their password. Google-only accounts start a separate OIDC round
through an authenticated, Origin-protected POST from Settings. The server verifies Google's signed
identity response against the existing Google subject, nonce, audience, issuer and time bounds,
then returns to Settings for a separate final confirmation. A challenge lasts at most ten minutes;
a user/session-bound one-use grant lasts at most five minutes. PostgreSQL stores hashes, and the
raw grant uses an HttpOnly/Secure/SameSite cookie. It is consumed atomically before deletion.
A provider failure requires a new round for a retry.

A session plus `DELETE`, an email match, a UI flag or selecting an account is insufficient.
This does not force Google to ask for its password again.
[Implementation and provider limitation](google-account-deletion.md).
The automated flow supplements, rather than replaces, a workable rights process for people who
cannot sign in.

## 4. Rights and current capability

| Right | Proposed handling and actual gap |
|---|---|
| Access, Art. 15 | Locate the person's data and provide the applicable processing information and a copy, protecting others' rights. No general export endpoint is implemented. A secure manual process still needs authorization, review, delivery controls and a synthetic exercise; direct production database access is not authorized by this draft. |
| Portability, Art. 20 | Assess automated processing based on consent/contract and data provided by the person. Do not assume every inferred summary or every other participant's speech is portable. Use an appropriate structured, commonly used machine-readable format for qualifying data. No complete workflow is implemented. |
| Rectification, Art. 16 | Assess incorrect attribution or generated statements, preserving needed context without silently presenting inaccurate content as corrected truth. No dedicated correction/annotation workflow exists; a manual change would need a separately approved process. |
| Erasure, Art. 17 | Apply grounds and exceptions by data purpose. Account deletion has the scoped implementation below. Participant-specific and waitlist deletion workflows remain gaps. |
| Objection, Art. 21 | Assess the actual basis and grounds. An objection is distinct from erasure; relevant processing may need to stop, and direct-marketing objections have their own rule. No participant objection workflow is implemented. |
| Restriction, Art. 18 | Assess when continued storage with restricted use is required. A note in a request log alone does not prevent application/provider processing. No enforced restriction mechanism is implemented. |

## 5. What account deletion actually reaches

After PR75, deletion of known Storage audio and Recall recordings must succeed before local account
erasure proceeds. The local path removes associated meeting content and account/session data
and clears the local Paddle email/user link with a persistent marker, so late customer upserts
cannot restore it. The grant is not reusable after failure.

This is not a global transaction or proof of complete erasure. Earlier remote deletions may
already have succeeded when a later one fails; a local database failure can also leave partial
work requiring a controlled retry. Provider responses are the adapter's success evidence, not
independent confirmation of every provider backup or retained record.

Known limitations include independent Paddle records, retained provider/subscription identifiers,
failed webhook payloads, waitlist addresses, unknown orphan audio, telemetry and provider backups.
The verification-send ledger retains events with a nullable user reference until pruning; that
alone is not proof of anonymization. Expiring database/backup records must not silently recreate
erased links after restore. See [retention](data-retention.md),
[billing marker](billing-anonymization.md) and [upload limits](upload-limits.md).
Do not promise that participant audio is always already gone.

## 6. Recipient notification

Where Article 19 applies, notify recipients of rectification, erasure or restriction unless the
stated impossibility/disproportionate-effort exception is established; inform the person of those
recipients on request. Recipients can include processors and independent controllers, not just
vendors with a DPA. Identify applicable instructions and responsibilities from
[the role inventory](data-processors.md). A statutory duty does not exist only when a contract
repeats it. [GDPR Articles 19 and 28 (IMY full text)](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/).

## 7. Acceptance criteria before relying on this procedure

| Work | Responsible role | Evidence needed |
|---|---|---|
| Accountable owner/deputy and monitored intake | Owner + support | Named coverage, tested delivery and escalation |
| Purpose/role and participant path | Adviser + privacy owner | Reviewed identity, search, third-party and response rules |
| Private request register and delivery | Operations | Access/retention controls and a synthetic end-to-end exercise |
| Waitlist withdrawal/retention/erasure | Engineering + privacy owner | Implemented and tested paths with matching notice |
| Access/portability, correction and restriction | Engineering + support + adviser | Exercised scoped manual or product process; a general export platform is outside these PRs |
| Provider/recipient handling | Owner + providers | Actual contacts, terms and erasure/restriction limitations |
| Self-service account deletion release | Engineering + operator | Final CI, approved migration and synthetic provider/browser release checks |

Priorities, dependencies and owners for further launch work are in [launch handoff](launch-handoff.md).
Nothing here authorizes external messages, collection of real identity documents or production edits.

## Additional reference

[EDPB Guidelines 01/2022 on the right of access](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en).
