import type { TranscriptSegment } from '../../domain/types';

// Day 7: the grounding/trust rules belong to the PORT, not the vendor — this is a verbatim port of
// adapters/claude/prompts.ts + chat-prompts.ts. Gemini must obey the exact same contract as Claude.

/** "[03:07]" — offset from meeting start. Minutes are not capped at 60. */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** One line per segment. Timestamps are what let the model ground claims to moments. */
export function renderTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTimestamp(s.startMs)}] ${s.speaker}: ${s.text}`)
    .join('\n');
}

/**
 * The grounding contract for meeting chat (Architecture-Day3 §2): answers come ONLY from the
 * transcript, every factual claim cites [mm:ss], and "not discussed in this meeting" is a valid
 * answer. One invented answer kills trust in the whole product — so the rules are absolute.
 * The transcript lives in the system instruction; the conversation turns go in `contents`.
 */
export function buildChatSystemPrompt(segments: TranscriptSegment[]): string {
  return `You are answering questions about ONE specific meeting. The transcript below is your ONLY source of truth.

TRANSCRIPT (one line per utterance, [mm:ss] is the offset from the start of the meeting):
${renderTranscript(segments)}

RULES — these are absolute:
- Answer ONLY from the transcript above. Never use outside knowledge and never infer beyond what was actually said.
- Cite the moment for every factual claim with the [mm:ss] timestamp of the line(s) it comes from.
- Attribute every quote or statement to the speaker who actually said it, never to anyone else.
- If the answer is not in this meeting, say so plainly — for example: "That wasn't discussed in this meeting." Never guess, never fabricate.
- Answer in the same language the question is asked in.
- Keep answers short — 2 to 5 sentences — unless the question genuinely calls for a list. No preamble. No markdown headings or bullet syntax unless the user explicitly asks for a list.`;
}
