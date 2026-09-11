# Recall error boundary

All public Recall adapter operations return a generic `BotProviderError` on failure. HTTP maps it
to 502 `BOT_PROVIDER_ERROR` with one stable message. Raw upstream bodies, status text, network
exception messages, JSON parser excerpts, causes, credentials and signed download URLs are discarded.
The adapter logs only a fixed operation, numeric HTTP status when available and a UUID-shaped
provider request ID. Other request-ID formats are omitted rather than treated as trustworthy text.

Sentry's `beforeSend` hook reduces bot-provider events to generic exception text, event/release
metadata and those permitted diagnostics plus a UUID-shaped application request ID. It discards
SDK-added request details, breadcrumbs, contexts, user fields, arbitrary tags and exception stacks.
This is a scoped boundary for bot-provider errors, not proof of complete log or error redaction
across all providers or historical events. Other adapters and retention remain separate review work.

The Recall request wrapper preserves one retry for network/5xx failures, a 15-second deadline now
covering body parsing, and the existing idempotent recording-deletion statuses. Signed transcript
downloads receive no Recall authorization header. Synthetic tests exercise every public operation,
download HTTP/network/JSON failures, timeouts, retry, safe diagnostics, HTTP output and Sentry context.
No real bot or provider recording was created or deleted during verification.
