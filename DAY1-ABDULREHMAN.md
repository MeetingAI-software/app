# DAY 1 — AbdulRehman Khan (Claude Code / Fable)

**Your half: the hard, correctness-critical path.** The Recall.ai adapter, webhook security + idempotency, the transcript normalizer (the single most important piece of code in the company — everything downstream eats its output), and the retrying worker loop.

**Read `ARCHITECTURE.md` first. Follow its contracts verbatim.**

**Paste this to Claude Code as your opening instruction:**
> Read ARCHITECTURE.md in the repo root. You are implementing the tasks in DAY1-ABDULREHMAN.md, in order. Follow the contracts in ARCHITECTURE.md exactly — never rename interfaces, fields, tables, or folders. After every step: run `npm run typecheck` and `npm test` and fix failures before moving on. Ask me before deviating from the architecture.

**Sequencing note:** Alper's Step 1 scaffolds the repo and commits `domain/`, `ports/`, and the DB schema (≈45 min). Until you can pull that, do your Steps 0–1 (accounts, ngrok, reading Recall docs) — they need no code.

---

## Step 0 — Accounts & keys (no code, ~20 min)

- [ ] Create the Recall.ai account. **In the dashboard, select the EU region** — your base URL will be region-specific. Put it in `RECALL_BASE_URL`.
- [ ] Copy the API key into your local `.env` (never commit). First 5 hours are free — today uses maybe 20 minutes of it.
- [ ] In Recall's dashboard, find the webhook settings. Note the **signing secret** → `RECALL_WEBHOOK_SECRET`.
- [ ] Skim Recall's docs for three things and write down the exact names you find: (1) the API call that creates a bot for a meeting URL, (2) how to enable **transcription with speaker labels + timestamps** in that call, (3) the webhook event that fires when the transcript is ready. Event names in code must come from the docs, not from memory — and they live ONLY in `adapters/recall/`.

## Step 1 — ngrok (the classic Day-1 trap, ~10 min)

- [ ] Install ngrok, run `ngrok http 3000`, copy the `https://...ngrok...` URL into `PUBLIC_WEBHOOK_URL`.
- [ ] Register `PUBLIC_WEBHOOK_URL + /webhooks/recall` as the webhook endpoint in Recall's dashboard.
- [ ] Know this: every time ngrok restarts, the URL changes and you must update it in Recall's dashboard. When the webhook "mysteriously stops working" today, check this FIRST — it will save you hours.

## Step 2 — Pull Alper's scaffold, then build the RecallAdapter

After `git pull` gives you `domain/`, `ports/`, and the schema:

- [ ] `adapters/recall/recall.adapter.ts` implementing `MeetingBotPort`:
  - `createBot({ meetingUrl, meetingId })` → calls Recall's create-bot API with the meeting URL, transcription **enabled with speaker diarization**, and an auto-leave / max-duration setting matching `MAX_MEETING_SECONDS` (belt-and-braces on top of Alper's app-level cap). Pass `meetingId` as metadata so webhooks can be matched back.
  - `getBotStatus(botId)` → map Recall's status strings to the port's four statuses (`joining | in_call | done | fatal`). The mapping table lives here and nowhere else.
  - `fetchTranscript(botId)` → fetch Recall's transcript for the bot, run it through the normalizer (Step 3), return `TranscriptSegment[]`.
  - All HTTP calls: 15s timeout, retry once on 5xx/network error with 2s backoff, then throw `BotProviderError` with a useful message. Never let a raw fetch error escape this file.

**Claude Code prompt for this step:**
> Implement adapters/recall/recall.adapter.ts implementing MeetingBotPort from ports/meeting-bot.port.ts. Use fetch with a 15s timeout and one retry on 5xx. Read RECALL_API_KEY and RECALL_BASE_URL from the config module. Enable transcription with speaker diarization and timestamps in the create-bot call, set the bot to auto-leave after MAX_MEETING_SECONDS, and attach our meetingId as metadata. Map provider statuses to the port's status union inside this file only. Throw BotProviderError from domain/errors.ts on failure.

## Step 3 — The transcript normalizer (THE critical piece, ~2h, test-first)

`adapters/recall/transcript.normalizer.ts` — converts whatever Recall returns into clean `TranscriptSegment[]`. If this is wrong, the document (Day 2), the chat (Day 3), and the timestamps feature are all wrong. **Write the tests first.**

Rules:
- [ ] If Recall returns word-level items, merge into utterances: start a new segment when the speaker changes OR the gap to the previous word exceeds 2000ms.
- [ ] `speaker` is never empty: use the participant name if present, else `"Speaker 1"`, `"Speaker 2"` consistently mapped per unique source speaker.
- [ ] Timestamps are integers in ms, `startMs <= endMs`; clamp small overlaps between consecutive segments; sort by `startMs`.
- [ ] Whitespace-collapse text; drop empty-text items.
- [ ] Empty transcript in → empty array out (no throw) + a `logger.warn`.
- [ ] Unknown/missing fields → skip the item with a warn, never crash the pipeline.

Required vitest cases (minimum):
- [ ] word-level input → correctly merged utterances (speaker change splits; long gap splits)
- [ ] missing speaker labels → stable `Speaker N` assignment
- [ ] overlapping timestamps → clamped, still sorted
- [ ] empty payload → `[]`
- [ ] a realistic fixture: save ONE real Recall payload from your first live test into `adapters/recall/__fixtures__/` and lock the normalizer against it. This fixture is gold — it protects you every time you touch this file for the next year.

## Step 4 — Webhook endpoint: verified, idempotent, fast (~1.5h)

- [ ] `adapters/recall/recall-webhook.verifier.ts`: verify the signature using `RECALL_WEBHOOK_SECRET` **on the raw request body** (Express must be configured to give you the raw body for this route — mind body-parser ordering). Invalid signature → 401, log warn. In development with `BOT_PROVIDER=fake`, verification may be bypassed with an explicit code comment saying why.
- [ ] `adapters/http/routes/webhooks.routes.ts` (`POST /webhooks/recall`):
  1. verify signature
  2. extract the provider's event id (fall back to a SHA-256 hash of the raw body if the provider doesn't send one)
  3. `webhookEventRepo.insertIfNew(...)` — if it returns false (duplicate delivery), respond 200 and stop
  4. respond **200 within <1s**. Zero processing inline. The worker does everything.
- [ ] `adapters/recall/recall-event.router.ts`: pure function mapping `eventType` → one of `'transcript_ready' | 'bot_status_change' | 'ignore'`. Recall's real event names live here only, taken from their docs.

## Step 5 — The worker loop (~1.5h)

`jobs/worker.ts` — started from `main.ts` alongside the HTTP server:

- [ ] Every 2s: `webhookEventRepo.claimNextPending()` (Alper implements it with `FOR UPDATE SKIP LOCKED`; you just call it).
- [ ] Route the event:
  - `bot_status_change` → map to a meeting status and apply via `assertTransition` (`in_call` → `recording`, etc.). Illegal transition → log error, `markProcessed`, move on (never crash the loop).
  - `transcript_ready` → look up meeting by botId → status `processing` → `bot.fetchTranscript(botId)` → `transcriptRepo.save(...)` → status `transcribed` + `durationSeconds` (from last segment's `endMs`, rounded up) → `usageRepo.addSeconds(...)` → `markProcessed`.
- [ ] On any error: `attempts++`, `nextAttemptAt = now + 2^attempts × 5s`. After 5 attempts: `markProcessed` + meeting `failed` with `errorMessage`. Nothing retries forever.
- [ ] Wrap the whole tick in try/catch — one poisoned event must never kill the loop.

**Claude Code prompt:**
> Implement jobs/worker.ts as a setInterval loop (2s) using WebhookEventRepository.claimNextPending. Route events via recall-event.router. For transcript_ready: transition meeting to processing, fetch + save the normalized transcript, transition to transcribed with durationSeconds, record usage, mark processed. Exponential backoff on failure (2^attempts × 5s), give up after 5 attempts by marking processed and failing the meeting. All status changes go through assertTransition. The loop itself must be crash-proof.

## Step 6 — Wire into main.ts + live test (~45 min)

- [ ] In `main.ts`: `BOT_PROVIDER === 'recall'` → construct `RecallAdapter`; else Alper's `FakeBotAdapter`. This `if` is the only place the choice exists.
- [ ] First live run: set `BOT_PROVIDER=recall`, ngrok up, webhook URL current in Recall's dashboard. Start a real Zoom meeting from your phone, POST it via curl, watch the bot join. Talk for 30 seconds (both of you, so there are 2 speakers). End the meeting.
- [ ] Watch the logs: webhook arrives → worker claims → transcript saved. Check the DB: segments have real timestamps and two speakers. **Save that raw payload as your test fixture (Step 3).**

## Stretch (only if time remains) — the reconciler

A second interval (every 60s): for meetings stuck in `bot_joining`/`recording`/`processing` older than 10 min, call `getBotStatus` and repair the state or fail the meeting. This covers "ngrok died and we missed the webhook" — the exact failure mode you WILL hit in demos. Company-grade resilience in ~30 lines.

## Your Definition of Done = items 2, 4, 5, 6 of the shared list in ARCHITECTURE.md §11. Then merge to `main` and run the full list with Alper.
