import { describe, it, expect } from 'vitest';
import {
  buildDocumentPrompt,
  buildRetryPrompt,
  buildSummaryPrompt,
  renderTranscript,
  uniqueSpeakers,
} from './prompts';
import type { TranscriptSegment } from '../../domain/types';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 4000, speaker: 'Alper Eken', text: 'Welcome to the budget review.' },
  { startMs: 65000, endMs: 70000, speaker: 'AbdulRehman Khan', text: 'Budget approved at 40k.' },
  { startMs: 3725000, endMs: 3730000, speaker: 'Alper Eken', text: 'I will own the breakdown.' },
];

const META = { meetingIsoDate: '2026-07-16' };

describe('renderTranscript', () => {
  it('renders one line per segment as [mm:ss] Speaker: text', () => {
    expect(renderTranscript(SEGMENTS)).toBe(
      [
        '[00:00] Alper Eken: Welcome to the budget review.',
        '[01:05] AbdulRehman Khan: Budget approved at 40k.',
        '[62:05] Alper Eken: I will own the breakdown.',
      ].join('\n')
    );
  });

  it('pads minutes and seconds to two digits', () => {
    const rendered = renderTranscript([
      { startMs: 9000, endMs: 10000, speaker: 'S', text: 'x' },
    ]);
    expect(rendered).toBe('[00:09] S: x');
  });

  it('does not roll minutes over at 60', () => {
    const rendered = renderTranscript([
      { startMs: 3_600_000, endMs: 3_601_000, speaker: 'S', text: 'x' },
    ]);
    expect(rendered).toBe('[60:00] S: x');
  });

  it('returns an empty string for an empty transcript', () => {
    expect(renderTranscript([])).toBe('');
  });
});

describe('uniqueSpeakers', () => {
  it('dedupes and preserves first-appearance order', () => {
    expect(uniqueSpeakers(SEGMENTS)).toEqual(['Alper Eken', 'AbdulRehman Khan']);
  });

  it('returns an empty array for an empty transcript', () => {
    expect(uniqueSpeakers([])).toEqual([]);
  });
});

describe('buildDocumentPrompt', () => {
  const prompt = buildDocumentPrompt(SEGMENTS, META);

  it('includes the output JSON schema', () => {
    for (const key of ['title', 'missed5', 'decisions', 'actionPoints', 'openQuestions', 'task', 'owner', 'deadlineIso']) {
      expect(prompt).toContain(`"${key}"`);
    }
  });

  it('demands JSON-only output with no fences or commentary', () => {
    expect(prompt).toContain('Output ONLY valid JSON');
    expect(prompt).toContain('No markdown fences, no commentary');
  });

  it('includes every speaker name', () => {
    for (const speaker of uniqueSpeakers(SEGMENTS)) {
      expect(prompt).toContain(speaker);
    }
  });

  it('renders the transcript with mm:ss timestamps', () => {
    expect(prompt).toContain('[00:00] Alper Eken: Welcome to the budget review.');
    expect(prompt).toContain('[62:05] Alper Eken: I will own the breakdown.');
  });

  it('frames the audience as the absent team member', () => {
    expect(prompt).toContain('ABSENT');
    expect(prompt).toContain('90 seconds');
  });

  it('encodes the no-invention trust rules for owner and deadline', () => {
    expect(prompt).toContain('MUST be spelled exactly as one of the speaker names');
    expect(prompt).toContain('Never guess an owner');
    expect(prompt).toContain('ONLY if a specific date was explicitly spoken');
    expect(prompt).toContain('Never compute or invent a date');
  });

  it('separates decisions from things merely discussed', () => {
    expect(prompt).toContain('actually DECIDED');
    expect(prompt).toContain('"openQuestions", NOT here');
  });

  it('includes the meeting date', () => {
    expect(prompt).toContain('2026-07-16');
  });

  it('builds a valid prompt from an empty transcript', () => {
    const empty = buildDocumentPrompt([], META);
    expect(empty).toContain('Output ONLY valid JSON');
    expect(empty).toContain('(none identified)');
    expect(empty.length).toBeGreaterThan(0);
  });
});

describe('buildSummaryPrompt', () => {
  const prompt = buildSummaryPrompt(SEGMENTS);

  it('asks for 3-5 plain sentences with no markdown', () => {
    expect(prompt).toContain('3-5 plain sentences');
    expect(prompt).toContain('No headings, no bullets, no markdown');
  });

  it('includes every speaker name and the rendered transcript', () => {
    for (const speaker of uniqueSpeakers(SEGMENTS)) {
      expect(prompt).toContain(speaker);
    }
    expect(prompt).toContain('[01:05] AbdulRehman Khan: Budget approved at 40k.');
  });

  it('frames the audience as the absent team member', () => {
    expect(prompt).toContain('ABSENT');
  });

  it('builds a valid prompt from an empty transcript', () => {
    const empty = buildSummaryPrompt([]);
    expect(empty).toContain('(none identified)');
    expect(empty).toContain('3-5 plain sentences');
  });
});

describe('buildRetryPrompt', () => {
  it('appends the validation issues and demands corrected JSON only', () => {
    const retry = buildRetryPrompt('BASE', 'missed5: Array must contain at least 3 element(s)');
    expect(retry).toContain('BASE');
    expect(retry).toContain(
      'Your previous output failed validation with these errors: missed5: Array must contain at least 3 element(s). Output ONLY corrected JSON.'
    );
  });
});
