import type { DocumentContent } from './document';
import type { TranscriptSegment } from './types';

// A display name is data, not prompt syntax. Keep ordinary Unicode names while removing
// line breaks, invisible direction controls, and other characters that can reshape a prompt.
const UNSAFE_LABEL_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/gu;
const PROMPT_DELIMITERS = /[<>{}\[\]:|]/gu;
const MAX_SPEAKER_LENGTH = 120;

export function normalizeSpeakerLabel(value: string): string {
  return value.replace(UNSAFE_LABEL_CHARS, ' ').replace(PROMPT_DELIMITERS, ' ')
    .replace(/\s+/gu, ' ').trim().slice(0, MAX_SPEAKER_LENGTH);
}

export function canonicalSpeakerLabels(segments: TranscriptSegment[]): string[] {
  return [...new Set(segments.map((segment) => normalizeSpeakerLabel(segment.speaker) || 'Speaker'))];
}

/** JSON quoting preserves commas and quotes; escaped angle brackets cannot close the data block. */
export function renderUntrustedSpeakerLabels(segments: TranscriptSegment[]): string {
  const labels = canonicalSpeakerLabels(segments);
  const json = JSON.stringify(labels.length ? labels : '(none identified)')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
  return `<untrusted_speaker_labels>\n${json}\n</untrusted_speaker_labels>`;
}

export function hasOnlyCanonicalOwners(content: DocumentContent, segments: TranscriptSegment[]): boolean {
  const allowed = new Set(canonicalSpeakerLabels(segments));
  return content.actionPoints.every((point) => point.owner === null || allowed.has(point.owner));
}
