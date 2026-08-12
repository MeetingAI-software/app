# Production data processor map

This inventory describes the integrations present in the Syncmemos codebase. It is an engineering
input to the Privacy Policy, not legal advice or proof that a vendor setting or agreement is active.
Dashboard configuration, contracted region, retention controls, subprocessor terms, and a signed
data processing agreement (DPA) must be checked before Live. "Not verified" below must never be
turned into a public residency claim.

| Provider | Purpose and data handled | Region | Retention and deletion | DPA status |
|---|---|---|---|---|
| Railway | Hosts the API, worker, sweep job, and operational logs; receives account, meeting, transcript, document, chat, usage, billing identifiers, IP/request metadata, and provider events. | Deployment region not verified. | Application rows follow [data retention](data-retention.md); platform logs/backups require dashboard verification. | Not verified. |
| Vercel | Hosts the Next.js frontend; receives page requests, IP/user-agent metadata, and any platform logs or analytics enabled outside this repository. | Deployment and log-processing regions not verified. | No application database is implemented in the web app; platform logs and deployment artifacts require dashboard verification. | Not verified. |
| Supabase | PostgreSQL persistence and temporary Storage for uploaded in-room audio; holds account, session, meeting, transcript, document, chat, usage, email, webhook, and Paddle mirror data. | Project database and Storage regions must be verified in the dashboard; the repository does not prove them. | Audio becomes eligible one hour after transcription and is deleted by the next sweep; account data is erased on account deletion; provider backups require verification. | Not verified. |
| Recall | Joins online meetings, records/transcribes them, and returns participant/timing/transcript data and provider identifiers. | Selected by `RECALL_BASE_URL`; the deployed value and workspace region are not verified here. | Syncmemos requests recording deletion after successful processing and on account deletion; provider-side residual retention requires verification. | Not verified. |
| AssemblyAI | Transcribes uploaded in-room audio and returns diarized transcript data through a webhook. | In-room recording is disabled by default. Production enablement requires `https://api.eu.assemblyai.com`, but the account provisioning and deployed value remain externally verifiable facts. | Uploaded audio is deleted from Syncmemos Storage after successful processing; AssemblyAI's own retention and deletion settings require verification. | Not verified. |
| Google | Gemini may generate documents/chat responses from transcripts; Google OAuth receives authentication identifiers and returns profile identity data. | Provider processing region and any Gemini regional controls are not verified. | Application output remains until account deletion; provider request/log retention requires verification. | Not verified. |
| Anthropic (optional) | When Claude is selected, receives transcript-derived prompts and returns generated documents or grounded chat answers. | Provider processing region is not verified. | Application output remains until account deletion; provider request/log retention and zero-data-retention eligibility require verification. | Not verified. |
| Resend | Sends verification email containing recipient address and a single-use verification URL; returns delivery metadata. | Processing region not verified. | The local send ledger is kept 30 days; Resend message/event retention requires verification. | Not verified. |
| Sentry | When configured, receives captured exceptions plus selected request, user, meeting, and operational identifiers. Raw verification tokens must not be sent. | Project region and relay/storage configuration are not verified. | Sentry event retention and scrubbing rules require dashboard verification. | Not verified. |
| Paddle | Merchant-of-record checkout, subscription management, customer portal, and webhooks; handles customer/contact, billing, tax, payment, transaction, subscription, and product data. Syncmemos stores a billing-state mirror. | Provider processing region is not controlled by this repository. | Paddle retains statutory transaction records under its own obligations; the local mirror follows account-erasure behavior and must be reconciled with required financial retention. | Not verified. |

## Data flows and deletion boundaries

- Online meetings flow through Recall to the API; provider recording deletion is requested after the
  transcript is safely processed and again during account deletion.
- In-room audio flows from the browser to Supabase Storage and, only when explicitly enabled, to
  AssemblyAI. The API refuses unsafe production enablement and deletes its stored audio on the
  documented sweep schedule.
- Transcripts may be sent to Gemini or Anthropic depending on `DOC_PROVIDER` and `CHAT_PROVIDER`.
  Generated content and chat are persisted in Supabase until account deletion.
- Resend receives verification delivery data; verification token rows expire after 24 hours and are
  removed by the sweep. Sentry receives errors, not deliberate credential payloads.
- Paddle's statutory merchant records are outside Syncmemos account-erasure control. The Privacy
  Policy must distinguish Paddle's independent obligations from Syncmemos' local billing mirror.

## Live verification checklist

- Record the contracted region and relevant dashboard screenshot/export for every active provider.
- Confirm deletion/retention settings, backups, logs, and subprocessors rather than inferring them
  from an API hostname.
- Obtain or confirm the applicable DPA and document its owner and review date.
- Remove unused optional providers and credentials from production.
- Reconcile this map with deployed environment variables and the final Privacy Policy before launch.
