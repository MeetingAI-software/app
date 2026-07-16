# DAY 2 — AbdulRehman Khan (Claude Code / Fable)

**Your half: the chef.** The Claude adapter, the prompts (this is The Wedge — the single reason a customer picks you over Otter), the JSON-robustness layer, the summary step in the worker, and the audio-deletion promise. The hardest part today is not code — it's making the prompts produce a document a stranger would pay €99 for.

**Read ARCHITECTURE-DAY2.md first (with ARCHITECTURE.md). Contracts are law.**

**Paste this to Claude Code as your opening instruction:**
> Read ARCHITECTURE.md and ARCHITECTURE-DAY2.md in the repo root. You are implementing DAY2-ABDULREHMAN.md, in order. Follow the contracts exactly — never rename interfaces, fields, tables, or folders. After every step run `npm run typecheck` and `npm test`. Ask me before deviating.

**Sequencing:** Your Step 1 unblocks Alper's frontend (the fake generator). Do Steps 0–1 first, push, tell him. His migration (his Step 1) unblocks your Step 4 — until you can pull it, Steps 2–3 need no DB.

---

## Step 0 — Anthropic API key (~10 min)

- [ ] console.anthropic.com → create an API key → `ANTHROPIC_API_KEY` in `.env` (never committed).
- [ ] `npm i @anthropic-ai/sdk zod` in `apps/api` (zod is already there from Day 1).
- [ ] Keep `DOC_PROVIDER=fake` for now — you'll flip it in Step 6.

## Step 1 — Commit today's contracts + the fake chef (~30 min, UNBLOCKS ALPER)

- [ ] Create verbatim from the addendum: `domain/document.ts`, `domain/document.schema.ts`, the two new error classes, `ports/document-generator.port.ts`, the `deleteRecording` addition to `ports/meeting-bot.port.ts`, and the `summary`/`shareToken` fields on the `Meeting` type.
- [ ] `adapters/fake/fake-document.generator.ts` implementing `DocumentGeneratorPort`: waits 2s, returns a canned summary and a canned-but-realistic `DocumentContent` (3 decisions, 4 action points with `owner` set to "AbdulRehman Khan"/"Alper Eken", 5 `missed5` bullets, 2 open questions). Alper's entire frontend runs on this today.
- [ ] `deleteRecording` no-op added to `FakeBotAdapter`.
- [ ] Commit, push, message Alper: "Day 2 contracts + fake generator on main."

## Step 2 — The ClaudeAdapter (~1.5h)

`adapters/claude/claude.adapter.ts` implementing `DocumentGeneratorPort`:

- [ ] Use `@anthropic-ai/sdk`; model, timeout from config. `temperature: 0.2` (documents should be boringly consistent, not creative).
- [ ] Render the transcript for the prompt as one line per segment: `[mm:ss] Speaker Name: text`. Timestamps in the prompt are what let Claude ground claims to moments.
- [ ] Guard: if rendered transcript exceeds `MAX_TRANSCRIPT_CHARS`, throw `DocumentGenerationError('transcript too large')` — don't silently truncate a customer's meeting.
- [ ] `generateSummary`: `max_tokens: 400`, returns plain text (strip any markdown Claude adds).
- [ ] `generateDocument`: `max_tokens: 2000`. Instruct JSON-only output (no prose, no code fences). Parse → validate with `documentContentSchema`.
- [ ] **The robustness loop (the part that makes this production-grade):** if parsing or Zod validation fails, retry ONCE, appending to the prompt: "Your previous output failed validation with these errors: <zod issues>. Output ONLY corrected JSON." Still invalid → throw `DocumentGenerationError` with the issues. Never save a half-valid document.
- [ ] Return `{ content, model, inputTokens, outputTokens }` from the SDK's usage fields. Log tokens at info level with meetingId — this is your COGS visibility from day one.

## Step 3 — The prompts: The Wedge (~2h — spend the time here, not on plumbing)

`adapters/claude/prompts.ts` — `buildSummaryPrompt(segments)` and `buildDocumentPrompt(segments, meta)`. The document prompt must encode ALL of these rules explicitly:

- [ ] **Audience:** "You are writing for a team member who was ABSENT. They will read this in 90 seconds and must be fully caught up." This framing changes everything Claude writes.
- [ ] **`missed5`:** 3–5 bullets, each standalone (understandable without the others), concrete (names, numbers, outcomes — not "the budget was discussed" but "budget approved at 40k, Alper owns the breakdown by Friday").
- [ ] **`decisions` vs discussion:** only things actually DECIDED. If it was debated but not settled, it belongs in `openQuestions`, not `decisions`.
- [ ] **No invention — the trust rules:** `owner` MUST be one of the speaker names appearing in the transcript, else `null`. `deadlineIso` ONLY if a date was explicitly spoken, else `null`. Nothing in the document may state a fact not present in the transcript. (A document that invents one deadline destroys the product's credibility permanently.)
- [ ] **Language:** plain, short sentences, no filler ("as discussed", "it was mentioned that"), no corporate padding. Write in the meeting's language (Swedish meeting → Swedish document).
- [ ] **Output contract:** the JSON schema pasted into the prompt, "output ONLY valid JSON, no markdown fences, no commentary."
- [ ] Unit tests: prompt builder includes the schema, includes every speaker name, renders timestamps as `mm:ss`; empty-ish transcript still builds a valid prompt.

## Step 4 — Generation service + routes (~1h, needs Alper's migration pulled)

- [ ] `application/generate-document.service.ts`: load meeting → status must be `transcribed` else `MeetingNotReadyError` (→ 409) → existing doc + no regenerate → return it → else load transcript → `docGen.generateDocument` → `documentRepo.upsertForMeeting` → return.
- [ ] Thin routes per addendum §6: `POST /api/meetings/:id/document` (+ `?regenerate=true`), `GET /api/meetings/:id/document`. Error mapping: `MeetingNotReadyError` → 409, `DocumentGenerationError` → 502.
- [ ] Route timeout ≥ 60s on the POST (generation is synchronous by design today).

## Step 5 — Worker extension: summary + the GDPR promise (~1h)

Extend yesterday's `transcript_ready` handler, AFTER `usage.addSeconds`:

- [ ] `generateSummary(segments)` with one retry → `meetingRepo.setSummary`. If it still fails: `logger.error`, leave summary `null`, continue — a missing summary must never block `markProcessed` or break the document button.
- [ ] On summary success → `bot.deleteRecording(botId)` inside its own try/catch: failure is `logger.warn` only (a sweep job catches stragglers on Day 4). Log the deletion at info — this line IS your GDPR audit trail for now.
- [ ] Order stays exactly: transcript saved → usage → summary → delete audio. Audio outlives everything until the pipeline has proven it can read the transcript.

## Step 6 — Recall deleteRecording + go live (~45 min)

- [ ] Check Recall's docs for the delete-recording/media endpoint; implement `deleteRecording` in `RecallAdapter`. Treat 404/"already deleted" as success (idempotent per the port contract).
- [ ] Flip `DOC_PROVIDER=claude`. Rerun on yesterday's real transcript fixture: read the document Claude produces **as if you were the absent teammate**. Is `missed5` genuinely enough to skip the meeting? Iterate the prompt until yes. Budget at least 3 iterations — this loop is the product.
- [ ] Tests: service tests with the fake generator (happy path, 409, regenerate); adapter test with a mocked SDK client for the invalid-JSON-retry path; keep one skipped-in-CI integration test that hits the real API on demand.

## Tonight — integration with Alper

Merge to `main`. Run the Definition of Done in ARCHITECTURE-DAY2.md §9 together — item 7 (real Zoom meeting → live share link → recording deleted at Recall) produces the exact link you'll show prospects Monday. Save it.
