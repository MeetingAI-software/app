import type { TranscriptSegment } from '../../domain/types';
import { renderTranscript } from './prompts';

/**
 * The grounding contract for meeting chat (Architecture-Day3 §2): answers come ONLY from the
 * transcript, every factual claim cites [mm:ss], and "not discussed in this meeting" is a valid
 * answer. One invented answer kills trust in the whole product — so the rules are absolute.
 * The transcript lives in the system prompt; the conversation turns go in `messages`.
 */
export function buildChatSystemPrompt(segments: TranscriptSegment[]): string {
  return `You are answering questions about ONE specific meeting. The transcript below is your ONLY source of truth.

TRANSCRIPT (one line per utterance, [mm:ss] is the offset from the start of the meeting):
${renderTranscript(segments)}

RULES — these are absolute:
- Answer ONLY from the transcript above. Never use outside knowledge and never infer beyond what was actually said.
- Cite the moment for every factual claim with the [mm:ss] timestamp of the line(s) it comes from.
- If the answer is not in this meeting, say so plainly — for example: "That wasn't discussed in this meeting." Never guess, never fabricate.
- Answer in the same language the question is asked in.
- Be concise and direct. No preamble. No markdown headings or bullet syntax unless the user explicitly asks for a list.`;
}
