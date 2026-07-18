import type { TranscriptSegment } from './types';

/**
 * Rename diarized speakers (`Speaker A`, `Speaker B`, …) to the participant names the user
 * entered before an in-room recording. One mic = mixed voices, so this is honest, prototype-grade
 * mapping by ORDER OF FIRST UTTERANCE — not real voice matching (Architecture-Day3 §2).
 *
 * - Distinct speakers are ordered by their earliest utterance time; `names[i]` renames the i-th.
 * - More speakers than names → the extras keep their generic label.
 * - More names than speakers → the unused names are ignored.
 * - Empty `names` → segments are returned unchanged.
 * - A blank/whitespace name is skipped, so a speaker label is never emptied (segments require a
 *   non-empty speaker).
 *
 * Pure and non-mutating: input segments are never modified; only renamed segments are new objects.
 */
export function mapSpeakers(segments: TranscriptSegment[], names: string[]): TranscriptSegment[] {
  if (names.length === 0) return segments;

  // Earliest utterance time for each diarized speaker label.
  const firstUtteranceMs = new Map<string, number>();
  for (const seg of segments) {
    const seen = firstUtteranceMs.get(seg.speaker);
    if (seen === undefined || seg.startMs < seen) {
      firstUtteranceMs.set(seg.speaker, seg.startMs);
    }
  }

  // Distinct speakers ordered by first utterance time. Sort is stable, so ties keep the order in
  // which the labels first appeared in the array.
  const orderedSpeakers = [...firstUtteranceMs.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([speaker]) => speaker);

  // Position i → names[i], skipping blanks so we never wipe a speaker label.
  const nameForLabel = new Map<string, string>();
  orderedSpeakers.forEach((speaker, i) => {
    const name = names[i];
    if (name !== undefined && name.trim() !== '') {
      nameForLabel.set(speaker, name);
    }
  });

  return segments.map((seg) => {
    const name = nameForLabel.get(seg.speaker);
    return name ? { ...seg, speaker: name } : seg;
  });
}
