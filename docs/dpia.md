# Data protection impact assessment (draft)

**Engineering draft updated 2026-09-11. Not approved, signed or a completed DPIA.**
Owner, accountable decision maker and review date: **Unassigned**.
It describes the ordered PR75 → PR76 code result. Local tests do not establish production
configuration, contracts, participant notice or accepted residual risk.

The identity/roles of the people or entities actually determining processing must be established.
A future seller decision or an empty controller field does not mean that current processing has
no controller. No current user/data-volume measurement was performed for this draft.

## 1. Need for a DPIA

The threshold is likely high risk to people's rights and freedoms. Assess the actual nature,
scope, context and purposes against Article 35 and the applicable supervisory-authority list.
IMY generally calls for a DPIA when at least two of its listed criteria apply, and some cases
can require one on a single criterion. Which criteria apply needs evidence:
[IMY guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/nar-ska-en-konsekvensbedomning-genomforas/).

| Factor to assess | Evidence or question for this service |
|---|---|
| Sensitive/highly personal content | Unfiltered meetings can contain health, union, employment or other private information; characterize actual intended use and exclusions |
| Vulnerable people | Employment, education or healthcare use may involve dependency; simply being a non-user does not establish vulnerability |
| Monitoring/evaluation | Recording and model-generated statements may affect people; a summary alone does not establish systematic scoring or significant-effect automated decisions |
| Scale | Number of people/records, duration and geographic extent Not verified; pre-launch or no paying accounts is not a measurement of personal-data processing |
| New technology | Diarized transcription and generative processing require a contextual assessment of novelty and risks |
| Rights/access effects | Participant rights gaps are real; they are not automatically the distinct criterion of processing to deny a service or contract |

**Working decision: prepare and complete this assessment before expanding the affected processing,
and obtain a qualified determination of the mandatory DPIA scope.** The prior mechanical
“five criteria” conclusion and “biometric-adjacent” label were not adequate evidence.

Speech recordings are not automatically special-category biometric data. The Article 9 biometric
rule concerns processing for unique identification; the reviewed application does not intentionally
build cross-meeting voiceprints. Verify provider behavior. Separately, transcript content itself
may contain Article 9 categories or Article 10 data; absence of voice identification does not
remove those questions.

## 2. Description of processing

An organizer connects a bot meeting or uploads an in-room recording. Recall or, when enabled,
AssemblyAI produces speaker-labelled transcripts. Gemini or optional Anthropic generates documents,
summaries or transcript-grounded chat. Owners can enable a time-limited bearer share link.

Affected people include account holders, participants without accounts, people mentioned in
content, waitlist subscribers and web/share visitors. Development/test participants can also be
identifiable. Email registration and login through an existing linked Google identity are separate;
the new deletion round neither creates accounts nor links a new identity.

[RoPA](ropa.md) lists accounts/session and deletion-authorization hashes, audio, meeting metadata,
transcripts/raw payloads/live segments, generated content/chat, usage, webhook payloads, waitlist,
billing mirror and telemetry. [Provider inventory](data-processors.md) includes Cloudflare and
distinguishes Google Gemini from OAuth and Paddle's own merchant records.

Legal bases are proposals to review purpose by purpose. Necessary account service may rely on
contract; this does not supply a basis for every participant's speech or every model use.
Legitimate interests requires its own necessity/balancing assessment; special-category processing
needs a relevant additional condition. Waitlist consent needs a workable withdrawal path. Paddle's
statutory basis is not automatically the basis for our local mirror.

Processing countries, transfers, provider input use/retention, subprocessors and actual terms remain
Not verified. An AssemblyAI EU-origin startup guard and Recall base URL are limited code evidence.
Do not turn these into a residency or no-training claim.

Audio/Recall records become eligible for cleanup after one hour with sweep attempts at boot and
six-hour intervals; outages and failures can extend retention. Raw/failed/orphan copies have known
gaps. [Retention inventory](data-retention.md) distinguishes use expiry, cleanup and provider records.

## 3. Necessity and proportionality

Assess which data and generated features are necessary for each agreed purpose, and whether less
intrusive input, shorter retention or an alternative recording workflow can achieve it. Do not
assume that every raw provider field is necessary because it can help debugging or reprocessing.

Determine how participants receive information, what choice or objection they have, and the safe
response when recording is inappropriate. The organizer's versioned confirmation is evidence of
their assertion, not individual notice, freely given consent or a lawful basis.

Evaluate accuracy safeguards and correction of speaker attribution/generated assertions. Bearer
sharing requires a deliberate audience decision: expiry cannot revoke saved copies. Assess access
and erasure for non-users, and whether claimed operational safeguards actually execute.

## 4. Consultation and evidence

No consultation/approval is established by this draft. The owner must arrange qualified review,
record the accountable controller's decisions and assess the DPO requirement under the actual
processing. Consider participants' views where appropriate and record reasons for any exception.

Article 36 prior-consultation applicability remains open until the assessment and effective
mitigations establish residual risk. Do not decide it from a list of planned actions or a merge.
[GDPR Articles 35–37 (IMY full text)](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/).

## 5. Risks to people

The ratings below are **initial qualitative hypotheses**, not measured probability or accepted
residual risk. Reassess them for the actual processing and affected population.

| Risk | Potential harm | Initial concern |
|---|---|---|
| R1 Uninformed/inappropriate recording | Exposure of private speech; employment or personal consequences; loss of choice | High |
| R2 Forwarded or compromised share link | Content disclosed beyond the intended audience | High |
| R3 Unknown provider retention/locations/use | Uncontrolled copies, transfers or secondary processing | High |
| R4 Incorrect transcript/generated assertions | Misattribution, reputational harm or decisions based on false text | Material |
| R5 Raw, failed or orphan content persists | Unnecessary exposure and incomplete erasure | High |
| R6 Participant rights cannot be exercised effectively | Inability to find, correct, restrict or erase personal data | High |
| R7 Prompt injection through speech/content | Misleading output or unintended disclosure in the model path | Material; validate actual scope |
| R8 Waitlist retained without withdrawal/deletion | Continued unwanted contact and loss of control | Material |
| R9 Account/session compromise | Access to private meetings or destructive account operations | High |

## 6. Implemented controls and their limits after PR75

| Risk | Code measure | Limit requiring evidence or more work |
|---|---|---|
| R1 | Versioned, server-stamped organizer notice acknowledgement before recording/upload processing | Does not prove participant notice/consent or an adequate lawful basis |
| R2 | Opt-in sharing, owner disable/rotate, 24-hour expiry on enable; SQL expiry and generic noindex/no-store share metadata | Forwarded/downloaded copies remain; live release not verified by code |
| R3 | Configuration guards and provider inventory | Actual service regions, terms, transfers and retention unverified |
| R4 | Grounded generation and presentation of generated content | No complete correction/participant remedy process |
| R5 | Successful webhook payload redaction, eligible transcribed/failed-audio cleanup, fail-closed known-media account erasure | Failed payloads, raw transcripts, orphan objects and external retention remain gaps |
| R6 | Owner self-service account deletion | Not a participant access/export/erasure system |
| R7 | Separation of untrusted transcript content from instructions | Mitigation, not proof of full injection resistance |
| R8 | Waitlist uniqueness prevents duplicate rows | No retention/unsubscribe/erasure mechanism |
| R9 | Hash-based sessions, password checks, Origin/auth/ownership/rate limits and new Google deletion proof | A compromised session still grants its ordinary access; Google can use its existing login session |

Google-only deletion requires a verified identity round bound to the current account/session and
a one-use server grant, then separate Settings confirmation. Raw grants are cookie-only; retry after
failure needs new authorization. [Detailed guarantees](google-account-deletion.md).
Recall errors are sanitized within the [documented boundary](recall-error-boundary.md), not across
all historic telemetry. [Upload](upload-limits.md) and [SSE](live-stream-limits.md) admission are
process-local; neither is a production capacity benchmark.

## 7. Controller/processor assessment for meeting content

Establish who determines each purpose and essential means from the actual organizer use, contracts
and service behavior. Roles can differ across meeting processing, account administration,
analytics and merchant records; do not choose one label for everything.

| Possible relationship | Implication to review |
|---|---|
| Service processes on organizer/controller instructions | Article 28 terms, authorized subprocessing, assistance and operational rights/incident channels |
| Service determines its own content-processing purposes | Own lawful basis, transparency under applicable Articles 13/14, rights handling and accountability |
| Joint determination of relevant purposes/means | Article 26 arrangement with transparent responsibilities; rights can be exercised against either controller |

The organizer is not automatically the appropriate controller for every scenario. Household,
employment and organizational use may differ. Non-users are not outside GDPR protection.
Missing contact details do not automatically create Article 14 disproportionate-effort relief.
This assessment may require code, notice-flow, support or contract changes.

## 8. Required work and decision ownership

Use the priority/role/dependency/definition-of-done table in [launch handoff](launch-handoff.md).
It includes participant DSR/access/export, waitlist retention/withdrawal/erasure, failed webhook and
orphan audio cleanup, raw transcript minimization, provider roles/agreements/regions/transfers,
seller/support facts and future CSP enforcement.

Assign named owners privately. Validate controls and recovery with synthetic scenarios, establish
actual provider evidence and review the lawfulness/necessity analysis before approving affected use.
A controlled closed-mode security merge and commercial launch approval are separate decisions.
Review this DPIA when processing, scale, providers, models or risk changes.

## 9. Residual risk decision

**Not assessed or accepted by this draft.** Planned actions and merged code do not establish the
remaining risk or remove an Article 36 obligation. The accountable controller must review actual
control effectiveness, unresolved harms and consultation requirements, taking qualified advice.
Record the rationale, scope, evidence and date; do not infer approval from unchecked tasks.

Additional reference: [EDPB DPIA guidance WP248 rev.01](https://ec.europa.eu/newsroom/article29/items/611236).
