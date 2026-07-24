# Gemini vs Claude — Document Generation Eval (Day 7)

**Verdict:** _(fill in after the eval)_ — Claude / Gemini

**Default rule (ARCHITECTURE-DAY7 §2):** documents **revert to Claude** unless Gemini is *clearly*
better on quality — not just cheaper. "About the same" ⇒ Claude stays. The Claude prompts were
iterated against real pilot meetings; the challenger carries the burden of proof.

---

## How to run

1. Pick the **same real transcript** Claude last generated from (your best fixture meeting).
2. Generate with Claude (baseline), then flip `DOC_PROVIDER=gemini` in `apps/api/.env`, restart the
   API, and `POST /api/meetings/:id/document?regenerate=true` on the same meeting.
3. Token counts + latency are logged per call: look for `"Gemini token usage"` /
   `"Claude token usage"` lines (they carry `inputTokens`, `outputTokens`, `latencyMs`, `attempts`).
4. Cost per document = tokens × the provider's per-token price (check each console's pricing page).

## Eval sheet (same meeting, both providers)

| Criterion | Claude | Gemini |
|---|---|---|
| `missed5`: standalone, concrete, absent-teammate-sufficient? | | |
| Invention check: every owner a real speaker? every deadline actually spoken? (cross-read transcript) | | |
| Swedish meeting → Swedish document? | | |
| `decisions` vs `openQuestions` split correct? | | |
| JSON valid first try? (retry count) | | |
| Tokens in/out → cost per document | | |
| Latency (ms) | | |

## Rollback rehearsal (do it once, whichever way you decide)

Flip `DOC_PROVIDER` to the other provider, regenerate, confirm prior behaviour returns, flip back to
the winner. The switch is now a known-good move, not a theory. Chat and documents each have their own
switch (`CHAT_PROVIDER`, `DOC_PROVIDER`) — they roll back independently.
