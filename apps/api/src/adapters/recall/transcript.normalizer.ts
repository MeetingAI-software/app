import type { TranscriptSegment } from '../../domain/types';

/**
 * Timestamps arrive as `{ absolute: ISO-8601, relative: seconds }` objects. Older payloads
 * (and the fake provider) use a bare number. `relative` is seconds from recording start,
 * which is what our segments are measured in.
 *
 * Exported because the live-transcript path parses the same timestamp shape off the realtime
 * webhook; the two must agree or live and final timestamps would drift apart.
 */
export function toSeconds(value: any): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.relative === 'number') {
    return value.relative;
  }
  return null;
}

export interface SpeakerSource {
  speaker?: unknown;
  participant?: { id?: unknown; name?: unknown } | null;
  speaker_id?: unknown;
}

/**
 * Speaker labelling, shared by the post-call and live paths so an unnamed participant gets the
 * same `Speaker N` label in both. Stateful: the returned function remembers which anonymous
 * participant it has already numbered, so one resolver must be used per transcript (post-call)
 * or per meeting (live).
 */
export function createSpeakerResolver(): (raw: SpeakerSource) => string {
  const speakerMap = new Map<string, string>();
  let nextSpeakerIndex = 1;

  return (raw: SpeakerSource): string => {
    const rawSpeaker = raw.speaker;
    if (typeof rawSpeaker === 'string' && rawSpeaker.trim()) {
      return rawSpeaker.trim();
    }

    const participantName = raw.participant?.name;
    if (typeof participantName === 'string' && participantName.trim()) {
      return participantName.trim();
    }

    const rawId = raw.speaker_id ?? raw.participant?.id;
    const key = rawId !== undefined && rawId !== null ? String(rawId) : 'default';
    if (!speakerMap.has(key)) {
      speakerMap.set(key, `Speaker ${nextSpeakerIndex++}`);
    }
    return speakerMap.get(key)!;
  };
}

export function normalizeTranscript(payload: any): TranscriptSegment[] {
  if (!payload) {
    console.warn('⚠️ Empty transcript payload received');
    return [];
  }

  let rawSegments: any[] = [];
  if (Array.isArray(payload)) {
    rawSegments = payload;
  } else if (typeof payload === 'object') {
    if (Array.isArray(payload.transcript)) {
      rawSegments = payload.transcript;
    } else if (Array.isArray(payload.data)) {
      rawSegments = payload.data;
    } else if (Array.isArray(payload.segments)) {
      rawSegments = payload.segments;
    } else {
      console.warn('⚠️ Transcript payload does not contain a recognized array structure');
      return [];
    }
  } else {
    console.warn('⚠️ Transcript payload is of unrecognized type');
    return [];
  }

  if (rawSegments.length === 0) {
    console.warn('⚠️ Transcript payload contains an empty array');
    return [];
  }

  const resolveSpeaker = createSpeakerResolver();

  const words: Array<{ speaker: string; text: string; startMs: number; endMs: number }> = [];

  for (const rawSeg of rawSegments) {
    if (!rawSeg || typeof rawSeg !== 'object') {
      console.warn('⚠️ Skipping invalid segment item in payload:', rawSeg);
      continue;
    }

    const speakerName = resolveSpeaker(rawSeg);

    // Check if word-level items are present
    if (Array.isArray(rawSeg.words) && rawSeg.words.length > 0) {
      for (const word of rawSeg.words) {
        if (!word || typeof word !== 'object') {
          console.warn('⚠️ Skipping invalid word item in segment:', word);
          continue;
        }

        const text = (word.text || '').trim().replace(/\s+/g, ' ');
        if (!text) {
          continue;
        }

        const startTimestamp = toSeconds(word.start_timestamp ?? word.start_time);
        const endTimestamp = toSeconds(word.end_timestamp ?? word.end_time);

        if (startTimestamp === null || endTimestamp === null) {
          console.warn('⚠️ Skipping word due to missing/invalid timestamps:', word);
          continue;
        }

        const startMs = Math.round(startTimestamp * 1000);
        const endMs = Math.round(endTimestamp * 1000);

        if (startMs > endMs) {
          console.warn('⚠️ Skipping word due to startMs > endMs:', word);
          continue;
        }

        words.push({
          speaker: speakerName,
          text,
          startMs,
          endMs,
        });
      }
    } else {
      // Use segment-level text
      const text = (rawSeg.text || '').trim().replace(/\s+/g, ' ');
      if (!text) {
        continue;
      }

      const startTimestamp = toSeconds(rawSeg.start_timestamp ?? rawSeg.start_time);
      const endTimestamp = toSeconds(rawSeg.end_timestamp ?? rawSeg.end_time);

      if (startTimestamp === null || endTimestamp === null) {
        console.warn('⚠️ Skipping segment due to missing/invalid timestamps:', rawSeg);
        continue;
      }

      const startMs = Math.round(startTimestamp * 1000);
      const endMs = Math.round(endTimestamp * 1000);

      if (startMs > endMs) {
        console.warn('⚠️ Skipping segment due to startMs > endMs:', rawSeg);
        continue;
      }

      words.push({
        speaker: speakerName,
        text,
        startMs,
        endMs,
      });
    }
  }

  if (words.length === 0) {
    console.warn('⚠️ No valid transcript words or segments found after parsing');
    return [];
  }

  // Sort by startMs
  words.sort((a, b) => a.startMs - b.startMs);

  // Merge into utterances
  const mergedSegments: TranscriptSegment[] = [];
  let currentSegment: TranscriptSegment | null = null;

  for (const word of words) {
    if (!currentSegment) {
      currentSegment = {
        speaker: word.speaker,
        text: word.text,
        startMs: word.startMs,
        endMs: word.endMs,
      };
    } else {
      const gap = word.startMs - currentSegment.endMs;
      if (word.speaker !== currentSegment.speaker || gap > 2000) {
        mergedSegments.push(currentSegment);
        currentSegment = {
          speaker: word.speaker,
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs,
        };
      } else {
        currentSegment.text += ' ' + word.text;
        currentSegment.endMs = Math.max(currentSegment.endMs, word.endMs);
      }
    }
  }

  if (currentSegment) {
    mergedSegments.push(currentSegment);
  }

  // Clamp small overlaps between consecutive segments
  for (let i = 1; i < mergedSegments.length; i++) {
    const prev = mergedSegments[i - 1];
    const curr = mergedSegments[i];
    if (curr.startMs < prev.endMs) {
      if (prev.startMs <= curr.startMs) {
        prev.endMs = curr.startMs;
      } else {
        curr.startMs = prev.endMs;
      }
    }
  }

  // Re-verify startMs <= endMs after clamping
  return mergedSegments.filter(seg => seg.startMs <= seg.endMs && seg.text.trim().length > 0);
}
