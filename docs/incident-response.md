# Personal data breach procedure (draft)

**Draft, updated 2026-09-11. Not approved or exercised. Incident lead and deputy: Unassigned.**
This is a proposed process, not evidence of staffed coverage, tested alerts or provider contracts.

## 1. Scope and historical claims

A personal data breach can affect confidentiality, integrity or availability. Loss of audio may
qualify even without disclosure; a delivery outage does not automatically qualify. Establish which
personal data was compromised and its consequences in each case.

The previous draft reported that a retention sweep on 2026-08-08 destroyed audio for seven meetings
from an unmanaged laptop. This review did not reverify the incident records, affected content or
recovery. It cannot conclude either that notification was required or that there were no affected
people. Pre-launch processing can concern developers, test participants, waitlist subscribers and
visitors. Lack of paying users does not establish absence of data subjects or an accountable
controller. Review the actual facts privately, including the processing purpose and who determined
it; a seller field left blank does not suspend legal duties.

The remote-database boot guard is a technical measure. Its presence is not proof that every
incident is prevented or every administrative path is controlled.

## 2. Responsibilities to assign

| Role | Responsibility | Status |
|---|---|---|
| Accountable controller / authorized decision maker | Assess risk, required notifications and rationale for decisions | Identity and scope require factual confirmation |
| Incident lead and deputy | Timeline, coordination, coverage and escalation | Unassigned |
| Technical responder | Authorized containment, evidence preservation, remediation and verification | Unassigned |
| Communications / support | Controlled contact with affected people and handling replies | Unassigned |
| Privacy adviser / DPO where applicable | Advise on risk, duties and communication | Unassigned; DPO requirement not determined |

If we process meeting content on another controller's behalf, follow the agreed assistance and
notification arrangements without treating those arrangements as a waiver of statutory duties.
Different purposes may have different roles: [provider inventory](data-processors.md),
[DPIA §7](dpia.md).

## 3. Awareness and notification timing

Record initial detection and when there is a reasonable degree of certainty that personal data
has been compromised. Investigation must proceed promptly; waiting for a complete forensic report
does not postpone established awareness. A provider message is evidence to assess, not an
automatic substitute for our own awareness timeline.

For a controller, notification to the competent supervisory authority is required without undue
delay and, where feasible, within 72 hours of awareness, unless risk to people's rights and
freedoms is unlikely. Record reasons for delay and supply missing information in phases where
needed. A processor must notify the controller without undue delay. This Article 33(2) duty
comes from GDPR itself; contracts and operational contacts make it workable and may add terms.
[IMY: handling breaches](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/hantering-av-personuppgiftsincidenter/),
[IMY: processor incidents](https://www.imy.se/pui).

## 4. Proposed response steps

1. **Triage and contain under the responder's authority.** Assess the exposed route/data and
   proportionate measures such as revoking a share link or credential, pausing processing or
   restricting access. Preserve necessary evidence while preventing further harm. This document
   does not authorize production mutations during a code review.
2. **Preserve a minimal private record.** Record timestamps, deployment identity, affected systems,
   evidence references and known scope. Do not copy transcript content, secrets or request payloads
   into Git or general chat. Existing logs are a possible source, not a guaranteed complete audit
   trail; Recall sanitization deliberately omits sensitive bodies.
3. **Assess the effects on people.** Determine categories and approximate counts of people and
   records, identifiability, sensitivity, exposure, recipients, recoverability, duration and
   likely harm. Include participants without accounts and anyone represented in test data.
   A transcript can carry very high risk, but the conclusion must follow its actual context.
4. **Decide and document authority notification.** Identify the competent authority from the
   actual controller, establishments, cross-border processing and applicable competence rules.
   IMY is not established merely by a Swedish developer or website language. Notify when required;
   document the facts and reasoning if notification is not required.
5. **Assess communication to affected people separately.** Article 34 uses the higher threshold
   of likely high risk and requires communication without undue delay when applicable. Explain
   the incident, contact point, likely consequences and measures clearly. Assess each exception
   against evidence. Missing participant email addresses do not automatically establish
   disproportionate effort or authorize a public notice; evaluate safe contact through the
   organizer and alternatives that effectively inform people without further disclosure.
6. **Record and remediate.** Keep breach facts, effects, actions and decisions in a restricted
   register, including events not notified. Assign corrective actions, verify containment and
   remediation, and review whether the procedure and risk assessment need updating.

## 5. Provider and recipient coordination

Use the purpose-specific [DPA/evidence checklist](dpa-checklist.md). A processor/subprocessor
arrangement needs the applicable Article 28 terms and effective assistance/incident contacts.
Paddle's merchant-of-record records and Google's identity services can involve separate
controller purposes; do not label every vendor a processor.

Obtain the provider's affected-service scope, dates, data categories, mitigation and evidence
without waiting to start our assessment. Track our first awareness independently and supplement
notifications as facts develop. No contract or provider status page establishes that we have
received all relevant information.

## 6. Readiness before relying on this procedure

| Item | Responsible role | Acceptance evidence |
|---|---|---|
| Named lead, deputy and decision authority | Owner / accountable controller | Current contact and coverage record |
| Correct authority and role mapping | Adviser + controller | Written factual assessment and notification route |
| Private incident register and access | Operations | Restricted storage, retention and approved access |
| Provider incident channels and assistance | Owner + providers | Tested contacts and reviewed purpose-specific terms |
| Participant contact approach | Adviser + support | Reviewed method with identity and third-party safeguards |
| Synthetic tabletop | Incident lead + engineering | Timed share-disclosure/availability exercise and closed action items |

Nothing in this draft establishes that these acceptance criteria have been met.

## References

- [GDPR full text, Articles 4(12), 33 and 34 (IMY)](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/)
- [EDPB Guidelines 9/2022 on breach notification](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en)
- [Separate launch backlog](launch-handoff.md)
