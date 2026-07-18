import { describe, it, expect } from 'vitest';
import { mapSpeakers } from './speaker-mapping';
import type { TranscriptSegment } from './types';

/** Compact segment builder — order in the array is NOT assumed to be time order. */
function seg(speaker: string, startMs: number, text = 'x'): TranscriptSegment {
  return { startMs, endMs: startMs + 1000, speaker, text };
}

describe('mapSpeakers', () => {
  it('returns the segments unchanged when names is empty', () => {
    const segments = [seg('Speaker A', 0), seg('Speaker B', 1000)];
    const result = mapSpeakers(segments, []);
    expect(result).toBe(segments); // same reference — no work to do
  });

  it('returns an empty array for empty segments', () => {
    expect(mapSpeakers([], ['Alper'])).toEqual([]);
  });

  it('maps a single speaker to a single name', () => {
    const result = mapSpeakers([seg('Speaker A', 0)], ['Alper']);
    expect(result[0].speaker).toBe('Alper');
  });

  it('maps two speakers to two names in first-utterance order', () => {
    const segments = [seg('Speaker A', 0), seg('Speaker B', 2000)];
    const result = mapSpeakers(segments, ['Alper', 'AbdulRehman']);
    expect(result.map((s) => s.speaker)).toEqual(['Alper', 'AbdulRehman']);
  });

  it('orders by first utterance TIME, not by position in the array', () => {
    // Speaker B appears first in the array, but Speaker A speaks earlier in time.
    const segments = [seg('Speaker B', 5000), seg('Speaker A', 1000)];
    const result = mapSpeakers(segments, ['First', 'Second']);
    // A (1000ms) is earliest → 'First'; B (5000ms) → 'Second'.
    expect(result.find((s) => s.startMs === 1000)!.speaker).toBe('First');
    expect(result.find((s) => s.startMs === 5000)!.speaker).toBe('Second');
  });

  it('keeps generic labels for speakers beyond the provided names', () => {
    const segments = [seg('Speaker A', 0), seg('Speaker B', 1000), seg('Speaker C', 2000)];
    const result = mapSpeakers(segments, ['Alper']);
    expect(result.map((s) => s.speaker)).toEqual(['Alper', 'Speaker B', 'Speaker C']);
  });

  it('ignores unused names when there are more names than speakers', () => {
    const result = mapSpeakers([seg('Speaker A', 0)], ['Alper', 'AbdulRehman', 'Guest']);
    expect(result.map((s) => s.speaker)).toEqual(['Alper']);
  });

  it('renames every segment belonging to a mapped speaker', () => {
    const segments = [
      seg('Speaker A', 0),
      seg('Speaker B', 1000),
      seg('Speaker A', 2000),
      seg('Speaker A', 3000),
    ];
    const result = mapSpeakers(segments, ['Alper', 'AbdulRehman']);
    expect(result.map((s) => s.speaker)).toEqual(['Alper', 'AbdulRehman', 'Alper', 'Alper']);
  });

  it('preserves startMs, endMs, and text on mapped segments', () => {
    const segments = [seg('Speaker A', 500, 'hello there')];
    const [result] = mapSpeakers(segments, ['Alper']);
    expect(result).toEqual({ startMs: 500, endMs: 1500, speaker: 'Alper', text: 'hello there' });
  });

  it('preserves the original segment order', () => {
    const segments = [seg('Speaker A', 0), seg('Speaker B', 1000), seg('Speaker A', 2000)];
    const result = mapSpeakers(segments, ['Alper', 'AbdulRehman']);
    expect(result.map((s) => s.startMs)).toEqual([0, 1000, 2000]);
  });

  it('breaks first-utterance ties by first appearance in the array', () => {
    const segments = [seg('Speaker X', 1000), seg('Speaker Y', 1000)];
    const result = mapSpeakers(segments, ['First', 'Second']);
    expect(result.map((s) => s.speaker)).toEqual(['First', 'Second']);
  });

  it('skips blank or whitespace names so a speaker label is never emptied', () => {
    const segments = [seg('Speaker A', 0), seg('Speaker B', 1000)];
    const result = mapSpeakers(segments, ['   ', 'AbdulRehman']);
    // Blank name for A is skipped (keeps its label); B still aligns to names[1].
    expect(result.map((s) => s.speaker)).toEqual(['Speaker A', 'AbdulRehman']);
  });

  it('does not mutate the input segments', () => {
    const segments = [seg('Speaker A', 0), seg('Speaker B', 1000)];
    const snapshot = JSON.parse(JSON.stringify(segments));
    mapSpeakers(segments, ['Alper', 'AbdulRehman']);
    expect(segments).toEqual(snapshot);
  });
});
