import type { TranscriptSegment } from '../../domain/types';

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

  const speakerMap = new Map<string, string>();
  let nextSpeakerIndex = 1;

  const words: Array<{ speaker: string; text: string; startMs: number; endMs: number }> = [];

  for (const rawSeg of rawSegments) {
    if (!rawSeg || typeof rawSeg !== 'object') {
      console.warn('⚠️ Skipping invalid segment item in payload:', rawSeg);
      continue;
    }

    // Resolve speaker name
    let speakerName = '';
    const rawSpeaker = rawSeg.speaker;
    const participantName = rawSeg.participant?.name;
    const speakerId = rawSeg.speaker_id !== undefined && rawSeg.speaker_id !== null ? String(rawSeg.speaker_id) : '';

    if (typeof rawSpeaker === 'string' && rawSpeaker.trim()) {
      speakerName = rawSpeaker.trim();
    } else if (typeof participantName === 'string' && participantName.trim()) {
      speakerName = participantName.trim();
    } else {
      const key = speakerId || 'default';
      if (!speakerMap.has(key)) {
        speakerMap.set(key, `Speaker ${nextSpeakerIndex++}`);
      }
      speakerName = speakerMap.get(key)!;
    }

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

        const startTimestamp = word.start_timestamp ?? word.start_time;
        const endTimestamp = word.end_timestamp ?? word.end_time;

        if (typeof startTimestamp !== 'number' || typeof endTimestamp !== 'number') {
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

      const startTimestamp = rawSeg.start_timestamp ?? rawSeg.start_time;
      const endTimestamp = rawSeg.end_timestamp ?? rawSeg.end_time;

      if (typeof startTimestamp !== 'number' || typeof endTimestamp !== 'number') {
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
