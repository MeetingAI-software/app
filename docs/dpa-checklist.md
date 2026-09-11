# Provider agreement, role and region checklist

**Draft worksheet, not completed provider due diligence. Owner and review date: Unassigned.**

Use the [provider inventory](data-processors.md), including Cloudflare and separate Google Gemini
and OAuth purposes. First establish the role for each processing activity. Then establish the
appropriate contract and controls. An Article 28 DPA is not the correct universal label for every
vendor: Paddle acts as an independent controller for merchant-of-record buyer/sale purposes, and
identity/platform services may have distinct own-purpose processing.

## Evidence to collect privately

| Item | Required evidence |
|---|---|
| Service and role | Active service/tier, data categories/purpose, processor/controller/other allocation, reviewer |
| Applicable terms | Version/date, acceptance or incorporation mechanism, contracting entity and scope |
| Processor agreement where applicable | Article 28 terms in force, instructions, confidentiality, security, assistance, subprocessors and audit provisions |
| Location | Storage, processing, backup and support-access locations; hostname alone is insufficient |
| Transfers | Relevant destinations, adequacy/SCC or other mechanism, supplementary measures and assessment where required |
| Retention and deletion | Configured periods, residual copies/logs/backups, deletion semantics, evidence and exceptions |
| Notification | Direct legal obligations distinguished from agreed response targets, configured recipients and escalation contact |
| Rights assistance | Controller/processor responsibilities, verified intake channel, contract assistance and practical deletion/export limits |

Public boilerplate or a dashboard option does not show acceptance or enablement. Record evidence
location, verification date and responsible role. Do not put agreements, account identifiers,
secret values, personal documents or private correspondence in this repository.

## Service-specific questions

- **Supabase:** project, Storage and backup locations under the actual service; backup/restore
  evidence and deletion reconciliation. Do not infer independent regional configuration without evidence.
- **Recall:** workspace/region and signing setup; asynchronous versus realtime secret requirements;
  residual recordings after delete requests, failed-job retention and subprocessors.
- **AssemblyAI:** account provisioning and retention/training settings as well as EU endpoint.
- **Gemini and Anthropic:** actual paid/free service tier, input/output use, retention, regional
  controls and applicable data terms. Zero-retention eligibility is not proof it is enabled or that
  in-flight data cannot be exposed.
- **Railway and Vercel:** runtime/edge locations, log retention, access to injected credentials,
  deployment protection and any analytics outside source control.
- **Cloudflare:** zone services and proxy/TLS handling, cache rules for authenticated/private
  content, request/security logs, retention and applicable end-user-data terms.
- **Google OAuth:** identity-service role and account/identifier processing separately from Gemini.
- **Resend:** message bodies containing verification URLs, delivery-event retention and incident contact.
- **Sentry:** SDK capture, retained historical events and project scrubbing/retention. PR75 limits
  bot-provider error context; it does not establish complete redaction for all adapters.
- **Paddle:** seller/merchant entity, buyer privacy/rights process, statutory retention, hosted
  withdrawal function evidence and any separate service role. A closed current billing gate
  does not prove that no past transaction exists.

Article 33(2) imposes a processor's breach-notification duty without undue delay where GDPR applies;
it is not created solely by a contract. Agreements and tested contacts make the statutory process
operable and may add stricter targets. Confirm independent-controller sharing/notification duties
separately. See [incident procedure](incident-response.md).

## Completion criteria

Every active service has a reviewed purpose-specific role, the applicable agreement/terms evidence,
locations and transfers, retention/deletion limits and functioning incident/DSR contacts. Public
policy statements match that evidence. Any unknown stays explicit; an unacceptable control is
resolved, the service disabled/replaced in an authorized change, or risk assessed by the appropriate
owner/adviser. No agreement or legal approval is inferred from this checklist's existence.

Sources: [Paddle privacy](https://www.paddle.com/legal/privacy),
[Cloudflare privacy](https://www.cloudflare.com/privacypolicy/),
[GDPR Articles 28 and 33](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).
