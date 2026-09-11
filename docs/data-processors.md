# Provider and personal-data role inventory

**Draft engineering inventory, updated 2026-09-11. Contract, region and deployment evidence is not
verified unless explicitly stated. This is not an approved privacy policy.**

A vendor's role depends on the processing purpose and applicable terms. A merchant of record,
identity provider and infrastructure processor are not interchangeable. Article 28 agreements are
required for processor relationships; independent controllers need a separately assessed lawful
disclosure and transparency, not a fictitious processor agreement. Confirm any mixed roles.

| Provider/service | Purpose and data | Role to validate for our use | Evidence still needed |
|---|---|---|---|
| Railway | API, worker, sweep, logs; account/meeting/content and billing mirror data | Processor for hosted application data; assess own service-account/security records separately | Region, access, applicable DPA, logs, backups, incident contact |
| Vercel | Next.js web, request metadata, possible platform analytics/logs | Processor for hosted customer data; own platform purposes may differ | Production source revision/settings, processing locations, DPA, analytics and logs |
| Cloudflare | Public web proxy/edge requests, IP and request metadata | Assess processor role for proxied end-user data and separate own-purpose records | Zone/services, TLS termination, caching/logging, retention, DPA and transfers |
| Supabase | PostgreSQL and temporary uploaded audio Storage | Processor for application database and audio | Project/Storage/backup locations, applicable DPA, restorable backup and deletion controls |
| Recall | Bot recording/transcription, speaker/timing/content, provider IDs | Processor role for supplied meeting content subject to actual terms | Workspace region, subprocessors, signing setup, media deletion/residual retention, DPA |
| AssemblyAI | Transcription of uploaded in-room audio when enabled | Processor role subject to account/terms | EU provisioning, retention/training settings and DPA; endpoint validation alone proves none of these |
| Google Gemini | Transcript-derived prompts and generated documents/chat when selected | Establish role under the actual paid/free API service and terms; do not reuse OAuth assumptions | Service/tier, input use, retention/training, region, transfers and applicable data terms |
| Google OAuth | Google account authentication and linked subject identity | Google controls its Google-account authentication purposes; assess the app's receipt/use separately | Identity-service terms, disclosure, retention and transfer assessment |
| Anthropic (optional) | Transcript-derived prompts and generated text when selected | Establish processor/other purposes under the contracted API tier | Region, input use, retention, zero-retention eligibility and applicable DPA |
| Resend | Verification recipient, single-use URL and delivery events | Processor for transactional delivery; assess own-purpose metadata | DPA, message/event retention, region and incident contact |
| Sentry (optional) | Error events and selected operational identifiers | Processor for customer error data under applicable terms; own account purposes separately | Project region, event retention, SDK capture/scrubbing, DPA |
| Paddle | Checkout, tax/payment, subscription/customer records and signed events | Independent controller for merchant-of-record buyer/sale obligations; assess any other service purpose separately | Actual seller/contract entity, retained statutory records, rights route, transfers and applicable terms |

Observed on 2026-09-11: unauthenticated GETs to the public web returned server=cloudflare and a cf-ray
header. This establishes proxy use on those responses, not zone configuration or residency. API
health returned Railway's server header and main SHA d1707ba2be3a48dc73126225308fac6e44ddf0fb.
The connected Vercel team listing returned no accessible teams; that does not establish deployment
settings or the web's exact live revision.

## Deletion and disclosure boundaries

Online content flows through Recall to the API and database. Uploaded audio flows through Storage
to AssemblyAI only when enabled. Gemini/Anthropic receive prompts according to provider settings.
The [retention inventory](data-retention.md) distinguishes implemented cleanup from missing controls.

Account deletion first requires provider media deletion to succeed, then removes local account
content. This is not evidence that backups, provider logs, failed webhook payloads or Paddle's
merchant records are erased. [Google deletion](google-account-deletion.md),
[local billing anonymization](billing-anonymization.md) and the [Recall error boundary](recall-error-boundary.md)
describe the PR75 controls; they require that branch's migration and matching API/web release.

Record active providers, purpose-specific roles, executed/incorporated terms, regions, transfers,
retention and incident/DSR contacts in the private evidence record before making public claims.
Remove unused credentials only through an authorized operations change. See [provider checklist](dpa-checklist.md).

Sources for role distinctions: [Paddle privacy](https://www.paddle.com/legal/privacy),
[Cloudflare privacy](https://www.cloudflare.com/privacypolicy/). Their public policies do not prove
which agreement or account settings are active for Syncmemos.
