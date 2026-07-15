import { describe, it, expect, vi } from 'vitest';
import { normalizeTranscript } from './transcript.normalizer';

describe('transcript.normalizer', () => {
  it('should return empty array for null/undefined/empty input', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeTranscript(null)).toEqual([]);
    expect(normalizeTranscript(undefined)).toEqual([]);
    expect(normalizeTranscript([])).toEqual([]);
    expect(normalizeTranscript({})).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('should merge word-level items based on speaker changes and 2000ms gaps', () => {
    const payload = [
      {
        speaker: 'Alper Eken',
        words: [
          { text: 'Hello', start_timestamp: 0.0, end_timestamp: 0.5 },
          { text: 'world', start_timestamp: 0.6, end_timestamp: 1.0 },
          // gap is 1.5s -> no split
          { text: 'welcome', start_timestamp: 2.5, end_timestamp: 3.0 },
          // gap is 2.1s -> split
          { text: 'here', start_timestamp: 5.1, end_timestamp: 5.5 },
        ],
      },
      {
        speaker: 'AbdulRehman Khan',
        words: [
          { text: 'Hi', start_timestamp: 6.0, end_timestamp: 6.5 },
        ],
      },
    ];

    const result = normalizeTranscript(payload);
    expect(result).toEqual([
      { speaker: 'Alper Eken', text: 'Hello world welcome', startMs: 0, endMs: 3000 },
      { speaker: 'Alper Eken', text: 'here', startMs: 5100, endMs: 5500 },
      { speaker: 'AbdulRehman Khan', text: 'Hi', startMs: 6000, endMs: 6500 },
    ]);
  });

  it('should map missing speaker names consistently using speaker_id', () => {
    const payload = [
      {
        speaker_id: 101,
        words: [
          { text: 'Hello', start_timestamp: 0.0, end_timestamp: 0.5 },
        ],
      },
      {
        speaker_id: 102,
        words: [
          { text: 'Hi', start_timestamp: 1.0, end_timestamp: 1.5 },
        ],
      },
      {
        speaker_id: 101,
        words: [
          { text: 'Nice to see you', start_timestamp: 2.0, end_timestamp: 3.0 },
        ],
      },
    ];

    const result = normalizeTranscript(payload);
    expect(result[0].speaker).toBe('Speaker 1');
    expect(result[1].speaker).toBe('Speaker 2');
    expect(result[2].speaker).toBe('Speaker 1');
  });

  it('should clamp small overlaps between consecutive segments', () => {
    const payload = [
      {
        speaker: 'Speaker A',
        words: [
          { text: 'First phrase', start_timestamp: 0.0, end_timestamp: 2.0 },
        ],
      },
      {
        speaker: 'Speaker B',
        words: [
          { text: 'Second overlapping phrase', start_timestamp: 1.5, end_timestamp: 3.5 },
        ],
      },
    ];

    const result = normalizeTranscript(payload);
    expect(result).toEqual([
      { speaker: 'Speaker A', text: 'First phrase', startMs: 0, endMs: 1500 },
      { speaker: 'Speaker B', text: 'Second overlapping phrase', startMs: 1500, endMs: 3500 },
    ]);
  });
});
