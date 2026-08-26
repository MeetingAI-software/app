import { describe, it, expect } from 'vitest';
import { normalizeAssemblyTranscript } from './assemblyai.normalizer';
import { completedTranscriptFixture } from './__fixtures__/transcript-completed';

describe('normalizeAssemblyTranscript', () => {
  it('maps diarized utterances to generic Speaker labels with ms timestamps', () => {
    const segs = normalizeAssemblyTranscript(completedTranscriptFixture);
    expect(segs).toHaveLength(4);
    expect(segs[0]).toEqual({
      startMs: 0,
      endMs: 3500,
      speaker: 'Speaker A',
      text: expect.stringContaining('kick off'),
    });
    expect(segs[1].speaker).toBe('Speaker B');
    expect(segs.map((s) => s.startMs)).toEqual([0, 4000, 9500, 14500]);
  });

  it('throws when the transcript status is error', () => {
    expect(() => normalizeAssemblyTranscript({ status: 'error', error: 'bad audio' })).toThrow(/bad audio/);
  });

  it('falls back to a single segment when there are no diarized utterances', () => {
    const segs = normalizeAssemblyTranscript({
      status: 'completed',
      text: 'Just one speaker here.',
      audio_duration: 5,
      utterances: [],
    });
    expect(segs).toEqual([{ startMs: 0, endMs: 5000, speaker: 'Speaker A', text: 'Just one speaker here.' }]);
  });

  it('returns an empty array when there is no text and no utterances', () => {
    expect(normalizeAssemblyTranscript({ status: 'completed', text: '', utterances: [] })).toEqual([]);
  });

  it('drops utterances with empty text', () => {
    const segs = normalizeAssemblyTranscript({
      status: 'completed',
      utterances: [
        { speaker: 'A', start: 0, end: 1000, text: '   ' },
        { speaker: 'B', start: 1000, end: 2000, text: 'Real words.' },
      ],
    });
    expect(segs).toEqual([{ startMs: 1000, endMs: 2000, speaker: 'Speaker B', text: 'Real words.' }]);
  });

  it('truncates an absurdly long speaker label but keeps the segment', () => {
    // `speaker` is provider-supplied and lands on the public share page. A long label must be
    // bounded, but must never cost the user the utterance itself.
    const segs = normalizeAssemblyTranscript({
      status: 'completed',
      utterances: [{ speaker: 'x'.repeat(500), start: 0, end: 1000, text: 'Hi.' }],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].speaker).toHaveLength(120);
    expect(segs[0].text).toBe('Hi.');
  });

  it('keeps a speaker label that already says "Speaker"', () => {
    const segs = normalizeAssemblyTranscript({
      status: 'completed',
      utterances: [{ speaker: 'Speaker 1', start: 0, end: 1000, text: 'Hi.' }],
    });
    expect(segs[0].speaker).toBe('Speaker 1');
  });
});
