# DAY 2 — Alper Eken (Antigravity)

**Your half: the dining room.** The database migration, share tokens, the public share endpoint, and — the big one — the first real frontend: the meeting page and the beautiful document view. Tonight's share link IS the Monday demo, and you're building the page it opens.

**Read ARCHITECTURE-DAY2.md first (with ARCHITECTURE.md). Contracts are law.**

**Paste this to Antigravity as your opening instruction:**
> Read ARCHITECTURE.md and ARCHITECTURE-DAY2.md in the repo root. You are implementing DAY2-ALPER.md, in order. Follow the contracts exactly — never rename interfaces, fields, tables, or folders. After every step run `npm run typecheck` and `npm test`. Ask me before deviating.

**Sequencing:** Your Step 1 (migration) unblocks AbdulRehman's Step 4. His Step 1 (contracts + fake generator) unblocks your Step 3 onward — pull it before starting the frontend. You can each start immediately; the dependencies cross in the middle of the morning.

---

## Step 1 — Migration + repository updates (~1h, UNBLOCKS ABDULREHMAN)

- [ ] Pull AbdulRehman's contracts commit first (it changes `Meeting` type + ports).
- [ ] Local dev data from yesterday is disposable: `TRUNCATE meetings CASCADE` before migrating, so the `NOT NULL` share_token needs no backfill.
- [ ] Update `adapters/db/schema.ts` per addendum §4 (meetings: `summary`, `share_token` unique; documents: drop `content_md`, add `content` jsonb, `model`, `input_tokens`, `output_tokens`, unique on `meeting_id`). `db:generate` → inspect the SQL → `db:migrate`. Migration committed.
- [ ] `MeetingRepository`: `create()` now generates `shareToken` via `crypto.randomBytes(16).toString('base64url')`; add `setSummary`, `findByShareToken`; `findById`/`list` return the new fields.
- [ ] New `DocumentRepository` per the port: `upsertForMeeting` uses `ON CONFLICT (meeting_id) DO UPDATE` (regenerate = replace, exactly one row per meeting); `getByMeetingId`.
- [ ] Quick repo test: create meeting → shareToken present and unique across two meetings → upsert document twice → still one row, content replaced.
- [ ] Commit, push, message AbdulRehman: "migration + repos on main."

## Step 2 — CORS + the public share endpoint (~45 min)

- [ ] `cors` middleware on `/api/*`, allow-list from `WEB_ORIGIN` (no wildcard — this is a habit worth building on day 2, not retrofitting after launch).
- [ ] `GET /api/share/:token` per addendum §6: `findByShareToken` → 404 unknown → else compose `{ meeting: { status, createdAt, durationSeconds, summary }, document, transcript }`. Build the response object explicitly field-by-field — **`meetingUrl` and `botId` must never appear**; add a test asserting exactly that (this endpoint is public; leaking the Zoom link would let a stranger join their next call).

## Step 3 — Next.js scaffold (~45 min)

- [ ] `apps/web`: Next.js (App Router) + TypeScript + Tailwind, dev script pinned to port **3001**. `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3000` (mirrored in `.env.example`).
- [ ] `lib/api.ts` — one tiny typed client: `getMeetings`, `getMeeting(id)`, `getTranscript(id)`, `getDocument(id)`, `generateDocument(id, regenerate?)`, `getShare(token)`. All fetches go through this file (same discipline as the backend: vendors and endpoints live in one place).
- [ ] `lib/format.ts`: `msToClock(ms)` → `mm:ss` (or `h:mm:ss` past an hour). Unit-test it — it's on every transcript line.

## Step 4 — `/meetings` list (~30 min, deliberately plain)

- [ ] Newest first: date, status badge (color per status), duration if present, link to detail. No design effort here — boring by decision (see ARCHITECTURE-DAY2 §8).

## Step 5 — `/meetings/[id]` — the working screen (~2h)

State-driven, top to bottom:

- [ ] **Processing states** (`pending` → `processing`): status indicator + poll every 3s (simple `setInterval` in a `usePolling` hook; stop when `transcribed`/`failed`). `failed` shows `errorMessage` plainly.
- [ ] **Transcribed:** summary card at top (if `summary` is null, show "Summary being generated…" and keep polling briefly).
- [ ] **"Generate document" button** → `POST` (spinner labeled "Writing your document — up to 30 seconds"; disable while pending) → on 201/200 render the document (Step 6 component). If a document already exists on load, render it immediately and offer a small "Regenerate" instead.
- [ ] **Transcript accordion** at the bottom, collapsed by default: each row `[mm:ss] Speaker — text`. Subtle, readable, secondary.
- [ ] **Share button:** copies `${window.location.origin}/s/${shareToken}` with a "Copied ✓" flash. **Print button:** `window.print()`.
- [ ] Error states are honest: 409 → "Transcript isn't ready yet"; 502 → "Generation failed — try again" with a retry.

## Step 6 — `DocumentView`: the masterpiece (~2h — the design time goes HERE)

One component, used by both the internal page and the public page:

- [ ] Layout: centered column, max-width ~720px, generous vertical rhythm. Title + meeting date as the header.
- [ ] **`missed5` is the hero:** numbered cards (01–05), the largest type on the page after the title. A stranger skimming ONLY this section should be caught up — design it so their eye goes there first.
- [ ] `decisions`: checkmark-style list. `actionPoints`: task + owner chip + deadline chip (render nothing, not "null", when absent). `openQuestions`: distinct muted section at the end.
- [ ] Typography over decoration: no stock imagery, no gradients-for-the-sake-of-it. If it looks like a beautifully typeset one-pager, you've won.
- [ ] **`@media print`:** hide nav/buttons/accordion-chrome, black on white, sensible page margins; the document prints to a clean 1–2 page PDF. Test with the browser's print preview — this printed page is literally the artifact from the original plan's "Day 1 morning."

## Step 7 — `/s/[token]` — the public page (~45 min)

- [ ] Fetches `getShare(token)`, renders: summary card → `DocumentView` (read-only: no generate/regenerate) → transcript accordion. Print button stays (prospects will print it). Unknown token → friendly 404.
- [ ] A one-line footer with your product name — every shared document is quiet marketing (Otter grew on exactly this mechanic).
- [ ] Open it in an incognito window: it must work with zero auth, zero cookies.

## Step 8 — Prove it solo, end to end (~30 min)

With `BOT_PROVIDER=fake` and `DOC_PROVIDER=fake` (AbdulRehman's fake generator):

- [ ] Create meeting → watch it flow to `transcribed` → summary appears → Generate → fake document renders beautifully → copy share link → open in incognito → print preview is clean.
- [ ] You have now validated every pixel and every state without spending a cent on either vendor. Commit + push.

## Tonight — integration with AbdulRehman

Merge to `main`, flip `DOC_PROVIDER=claude`, then `BOT_PROVIDER=recall`, and run the Definition of Done in ARCHITECTURE-DAY2.md §9 together. Item 7 — the real 5-minute Zoom meeting ending in a live, beautiful share link with the recording deleted at Recall — is the whole day's point. Save that link somewhere safe: it's what you show 30 people on Monday.
