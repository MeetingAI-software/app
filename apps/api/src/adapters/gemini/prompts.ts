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

/** Speaker names in first-appearance order. The ONLY values allowed as an action point owner. */
export function uniqueSpeakers(segments: TranscriptSegment[]): string[] {
  return [...new Set(segments.map((s) => s.speaker))];
}

const OUTPUT_SCHEMA = `{
  "title": string,              // short + specific, e.g. "Q3 Budget Planning — 15 Jul 2026". 3-120 chars.
  "missed5": string[],          // 3-5 bullets
  "decisions": string[],        // things actually DECIDED
  "actionPoints": [
    {
      "task": string,
      "owner": string | null,       // MUST be one of the speaker names listed above, or null
      "deadlineIso": string | null  // "YYYY-MM-DD", ONLY if a date was explicitly said, else null
    }
  ],
  "openQuestions": string[]     // unresolved / parked items
}`;

const TRUST_RULES = `TRUST RULES — these are absolute:
- Never state a fact that is not present in the transcript. Do not infer, extrapolate, or fill gaps.
- "owner" MUST be spelled exactly as one of the speaker names listed above. If the transcript does not clearly assign the task to one of them, use null. Never guess an owner.
- "deadlineIso" ONLY if a specific date was explicitly spoken. "next week", "soon", "by the end of the sprint" are NOT dates — use null. Never compute or invent a date.
- If you are unsure whether something was said, leave it out.
A document that invents a single deadline or owner destroys this product's credibility permanently.`;

const LANGUAGE_RULES = `LANGUAGE:
- Write in the language the meeting was held in. A Swedish meeting produces a Swedish document.
- Plain, short sentences. No filler, no corporate padding.
- Never write "as discussed", "it was mentioned that", "the team talked about", "various topics were covered".
- Be concrete: names, numbers, outcomes. Not "the budget was discussed" but "budget approved at 40k, Alper owns the breakdown by Friday".`;

export function buildSummaryPrompt(segments: TranscriptSegment[]): string {
  const speakers = uniqueSpeakers(segments);
  return `You are summarising a meeting for a team member who was ABSENT.

Speakers in this meeting: ${speakers.length > 0 ? speakers.join(', ') : '(none identified)'}

TRANSCRIPT (one line per utterance, [mm:ss] is the offset from meeting start):
${renderTranscript(segments)}

Write 3-5 plain sentences covering what actually happened and what was decided.

${LANGUAGE_RULES}

RULES:
- Output plain text ONLY. No headings, no bullets, no markdown, no bold, no code fences.
- No preamble. Do not start with "Here is" or "This meeting". Start with the substance.
- Never state a fact that is not present in the transcript.
- If the transcript is too short or empty to summarise, say so in one plain sentence.`;
}

export function buildDocumentPrompt(
  segments: TranscriptSegment[],
  meta: { meetingIsoDate: string }
): string {
  const speakers = uniqueSpeakers(segments);
  return `You are writing a meeting document for a team member who was ABSENT. They will read this in 90 seconds and must be fully caught up. Everything you write is judged against that one test.

Meeting date: ${meta.meetingIsoDate}
Speakers in this meeting: ${speakers.length > 0 ? speakers.join(', ') : '(none identified)'}

TRANSCRIPT (one line per utterance, [mm:ss] is the offset from meeting start):
${renderTranscript(segments)}

FIELD RULES:

"missed5" — this is THE product. 3-5 bullets. This is what the absent person actually reads.
- Each bullet must stand alone and be understandable without the others.
- Each bullet must be concrete: names, numbers, outcomes.
- Ask of every bullet: "does this let someone skip the meeting?" If not, rewrite it.

"decisions" — only things that were actually DECIDED.
- If it was debated but not settled, it belongs in "openQuestions", NOT here.
- If nobody committed to it, it is not a decision.

"actionPoints" — concrete tasks someone is expected to do.
- See the trust rules on "owner" and "deadlineIso" below.

"openQuestions" — unresolved or parked items, and anything debated without being settled.

${TRUST_RULES}

${LANGUAGE_RULES}

OUTPUT CONTRACT:
Output ONLY valid JSON matching this schema. No markdown fences, no commentary, no explanation before or after. Your entire response must parse as JSON.

${OUTPUT_SCHEMA}

Empty arrays are correct and expected when a section genuinely has nothing in it. Never pad a section to fill it.`;
}

/** Appended verbatim to the document prompt for the single retry. */
export function buildRetryPrompt(basePrompt: string, issues: string): string {
  return `${basePrompt}

Your previous output failed validation with these errors: ${issues}. Output ONLY corrected JSON.`;
}
