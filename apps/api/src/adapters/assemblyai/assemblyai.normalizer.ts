import type { TranscriptSegment } from '../../domain/types';

interface AssemblyUtterance {
  speaker?: string;
  text?: string;
  start?: number; // milliseconds
  end?: number;   // milliseconds
}

interface AssemblyTranscript {
  status?: string;
  error?: string | null;
  text?: string;
  audio_duration?: number; // seconds
  utterances?: AssemblyUtterance[] | null;
}

/**
 * A display label, not prose. Bound it: `speaker` is provider-supplied and lands on the public
 * share page. Kept local rather than imported from the Recall normalizer so the two adapters stay
 * independent. Truncate rather than reject — a long label must not cost the user their transcript.
 */
const MAX_SPEAKER_LENGTH = 120;

/** AssemblyAI diarizes as "A", "B", … — present them as generic "Speaker A" labels (mapSpeakers renames later). */
function speakerLabel(raw: string | undefined): string {
  const label = (raw ?? 'A').toString().trim() || 'A';
  const full = /^speaker\b/i.test(label) ? label : `Speaker ${label}`;
  return full.slice(0, MAX_SPEAKER_LENGTH);
}

/**
 * Normalize an AssemblyAI transcript (GET /v2/transcript/{id}) into our TranscriptSegment[].
 * Timestamps are already in milliseconds. Diarized utterances become one segment each; a
 * single-speaker transcript falls back to one segment from the full text. Throws on an error status.
 */
export function normalizeAssemblyTranscript(payload: unknown): TranscriptSegment[] {
  const t = (payload ?? {}) as AssemblyTranscript;

  if (t.status === 'error') {
    throw new Error(`AssemblyAI transcription failed: ${t.error ?? 'unknown error'}`);
  }

  const utterances = Array.isArray(t.utterances) ? t.utterances : [];
  if (utterances.length > 0) {
    return utterances
      .map((u) => ({
        startMs: Math.max(0, Math.round(Number(u.start ?? 0))),
        endMs: Math.max(0, Math.round(Number(u.end ?? 0))),
        speaker: speakerLabel(u.speaker),
        text: (u.text ?? '').trim().replace(/\s+/g, ' '),
      }))
      .filter((s) => s.text.length > 0 && s.startMs <= s.endMs);
  }

  // No diarized utterances (e.g. a single speaker) — use the whole transcript as one segment.
  const text = (t.text ?? '').trim().replace(/\s+/g, ' ');
  if (text) {
    const endMs = t.audio_duration ? Math.round(t.audio_duration * 1000) : 0;
    return [{ startMs: 0, endMs: Math.max(0, endMs), speaker: 'Speaker A', text }];
  }

  return [];
}
