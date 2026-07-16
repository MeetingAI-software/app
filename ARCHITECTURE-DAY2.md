# ARCHITECTURE-DAY2.md — Addendum (Day 2: The Document)

**This file extends ARCHITECTURE.md — everything from Day 1 still applies. Same rule: contracts here are law. Change this file first, tell the other person, then change code.**

Give your agent BOTH architecture files plus your own task file.

---

## 1. Today's objective

Turn yesterday's transcript into the product people pay for: `transcribed meeting → auto-summary → (button) → structured document → beautiful shareable page → printable PDF`. Tonight's output is literally the demo link you send prospects on Monday.

## 2. New decisions (don't relitigate today)

| Decision | Choice | Why |
|---|---|---|
| Document format | **Strict JSON** (Zod-validated), not free markdown | Frontend renders each section beautifully; PDF/print stays clean; regeneration is comparable |
| Model | `claude-sonnet-4-6` via `@anthropic-ai/sdk` (env-configurable) | Quality/cost sweet spot — document costs cents, not tens of cents |
| Generation trigger | Summary = **automatic** (worker, right after `transcribed`). Document = **button** (`POST /api/meetings/:id/document`) | Matches the product spec you chose (summary + "generate document" button) |
| Generation style | Synchronous endpoint (~10–30s, 60s timeout) with a frontend spinner | A job queue for this is over-engineering today; revisit when real users queue up |
| One document per meeting | `UNIQUE(meeting_id)`; regenerate replaces | Simple; versioning is a post-customer feature |
| Audio deletion (GDPR promise) | Delete the recording at Recall **after transcript is safely stored AND summary generation succeeded** | Transcript in our DB is the source of truth; audio's only remaining use is re-transcription. Deletion failure is non-fatal (logged; Day 4 adds a sweep job) |
| PDF export | Browser print + `@media print` stylesheet | Reliable, zero dependencies, looks great if the page is built for it |
| Parallel-work switch | `DOC_PROVIDER=fake\|claude` (like yesterday's `BOT_PROVIDER`) | Alper builds the whole frontend against a fake generator; flip one env var tonight |

## 3. New domain contracts (copy VERBATIM)

```ts
// domain/document.ts
export interface ActionPoint {
  task: string;
  owner: string | null;        // MUST be a speaker name from the transcript, or null. Never invented.
  deadlineIso: string | null;  // "2026-07-18" — ONLY if a date was explicitly said. Never invented.
}

export interface DocumentContent {
  title: string;               // short + specific, e.g. "Q3 Budget Planning — 15 Jul 2026"
  missed5: string[];           // 3–5 bullets. THE product. Written for someone who was absent.
  decisions: string[];         // things actually DECIDED (not merely discussed)
  actionPoints: ActionPoint[];
  openQuestions: string[];     // unresolved / parked items
}
```

```ts
// domain/document.schema.ts  (Zod — the gate Claude's output must pass)
import { z } from 'zod';
export const actionPointSchema = z.object({
  task: z.string().min(3),
  owner: z.string().min(1).nullable(),
  deadlineIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export const documentContentSchema = z.object({
  title: z.string().min(3).max(120),
  missed5: z.array(z.string().min(5)).min(3).max(5),
  decisions: z.array(z.string().min(3)),
  actionPoints: z.array(actionPointSchema),
  openQuestions: z.array(z.string().min(3)),
});
```

```ts
// domain/errors.ts — ADD:
export class DocumentGenerationError extends Error {}   // → HTTP 502
export class MeetingNotReadyError extends Error {}      // → HTTP 409 (no transcript yet)
```

```ts
// ports/document-generator.port.ts
import type { TranscriptSegment } from '../domain/types';
import type { DocumentContent } from '../domain/document';

export interface DocumentGeneratorPort {
  /** 3–5 plain sentences. No headings, no bullets. */
  generateSummary(segments: TranscriptSegment[]): Promise<string>;
  generateDocument(segments: TranscriptSegment[], meta: { meetingIsoDate: string }): Promise<{
    content: DocumentContent;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}
```

```ts
// ports/meeting-bot.port.ts — ADD one method:
/** Delete the recording media at the provider. Idempotent; never throws on "already gone". */
deleteRecording(botId: string): Promise<void>;
```

```ts
// ports/repositories.port.ts — ADD:
export interface DocumentRepository {
  upsertForMeeting(meetingId: string, content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }): Promise<{ id: string }>;
  getByMeetingId(meetingId: string): Promise<{ content: DocumentContent; createdAt: Date } | null>;
}
// MeetingRepository — ADD:
//   setSummary(id: string, summary: string): Promise<void>;
//   findByShareToken(token: string): Promise<Meeting | null>;
//   (create() now also generates shareToken — see §4)
// Meeting type (domain/types.ts) — ADD fields:
//   summary: string | null;
//   shareToken: string;
```

## 4. Database changes (ONE migration, Alper implements)

```
meetings:
  + summary        text            (nullable)
  + share_token    text NOT NULL UNIQUE   -- generated app-side in MeetingRepository.create():
                                          -- crypto.randomBytes(16).toString('base64url')
documents:
  - content_md                     (drop — no real data yet; dev data may be truncated)
  + content        jsonb NOT NULL
  + model          text  NOT NULL
  + input_tokens   integer NOT NULL DEFAULT 0
  + output_tokens  integer NOT NULL DEFAULT 0
  + UNIQUE (meeting_id)
```

Dev note: it is fine to `TRUNCATE meetings CASCADE` locally before migrating — yesterday's rows are test data. Backfilling share tokens is then unnecessary.

## 5. New environment variables

```
ANTHROPIC_API_KEY=            # console.anthropic.com → API keys
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_TIMEOUT_MS=60000
MAX_TRANSCRIPT_CHARS=180000   # guard: politely refuse absurd inputs
DOC_PROVIDER=fake             # 'fake' | 'claude'  ← today's integration switch
WEB_ORIGIN=http://localhost:3001    # CORS allow-list for the API

# apps/web/.env.local:
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## 6. HTTP API — new/changed endpoints

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/meetings/:id/document` | Meeting must be `transcribed` else **409**. If a document exists and no `?regenerate=true` → **200** existing. Else: load transcript → `docGen.generateDocument` → Zod gate → upsert → **201** `{ document }`. Generation failure → **502**. |
| GET | `/api/meetings/:id/document` | **200** `{ content, createdAt }` or **404** |
| GET | `/api/share/:token` | **PUBLIC, no auth.** `{ meeting: { status, createdAt, durationSeconds, summary }, document, transcript }`. **Never include** `meetingUrl` or `botId` (don't leak the Zoom link on a public page). 404 on unknown token. |
| GET | `/api/meetings`, `/api/meetings/:id` | now include `summary` and `shareToken` |

CORS: allow `WEB_ORIGIN` on all `/api/*` routes.

## 7. Pipeline change (worker, after yesterday's `transcribed` step)

```
... usage.addSeconds(...)                        (yesterday, unchanged)
→ summary = docGen.generateSummary(segments)     (retry once on failure)
   → meetingRepo.setSummary(...)
   → bot.deleteRecording(botId)                  (the GDPR promise;
                                                  failure = logger.warn, NOT a pipeline failure)
→ markProcessed                                  (summary failure after retry: log error,
                                                  leave summary null, still markProcessed —
                                                  the document button must keep working)
```

Order is deliberate: **audio is deleted only after the transcript is stored and the summary proves the pipeline can read it.** If anything upstream failed, the audio survives for reprocessing.

## 8. Frontend (first real UI — one screen must be beautiful)

Next.js (App Router) + Tailwind in `apps/web`, dev on port **3001**.

| Route | Purpose |
|---|---|
| `/meetings` | plain list: title/date, status badge, link. Boring is fine here. |
| `/meetings/[id]` | **THE screen.** Status while processing (poll every 3s) → summary card → "Generate document" button (spinner, ~10–30s) → rendered document → transcript accordion (with `mm:ss` timestamps + speakers) → Share (copy `/s/[token]`) + Print buttons. |
| `/s/[token]` | Public read-only page: same document view, no controls. **This URL is what you send prospects.** |

Design bar for the document view (and only it): max-width ~720px, generous whitespace, clear hierarchy; `missed5` rendered as the visual hero (numbered cards); decisions/actions/questions as clean sections; `@media print` hides nav/buttons and yields a clean one-to-two-page PDF. Everything else stays plain.

## 9. Definition of Done — tonight, together

1. `DOC_PROVIDER=fake` + `BOT_PROVIDER=fake`: create meeting → auto-summary appears → click Generate → document renders with all five sections.
2. Flip `DOC_PROVIDER=claude`: regenerate on the same transcript → a real document; content passes the Zod gate; token counts stored in `documents`.
3. Feed Claude-invalid-JSON path (mock or force): one retry with validation errors appended; still invalid → **502**, nothing half-broken saved.
4. `?regenerate=true` replaces the document (still exactly one row per meeting).
5. Open `/s/[token]` in an incognito window: full read-only page, no auth, and the response contains **no** `meetingUrl`/`botId`.
6. Print from the share page → clean PDF, no buttons/nav visible.
7. **The real one:** `BOT_PROVIDER=recall` — hold a real 5-minute Zoom meeting between the two of you → within ~2 minutes: live share link with a genuinely good document → verify in the Recall dashboard that the recording was **deleted**. Save this link — it's your Monday demo.
8. `npm run typecheck && npm test` green in both apps.
