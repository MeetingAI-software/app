import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiDocumentAdapter } from './gemini-document.adapter';
import { buildDocumentPrompt } from './prompts';
import type { GeminiClient } from './gemini-chat.adapter';
import { DocumentGenerationError } from '../../domain/errors';
import type { TranscriptSegment } from '../../domain/types';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Sarah', text: 'We agreed to ship chat first.' },
  { startMs: 134000, endMs: 138000, speaker: 'Marcus', text: 'Delete the audio after the summary.' },
];

const VALID_DOC = {
  title: 'Q3 Product Sync',
  missed5: ['Ship chat first this sprint', 'Audio deleted after summary', 'Beta delayed by two weeks'],
  decisions: ['Ship chat before documents'],
  actionPoints: [{ task: 'Draft the timeline', owner: 'Sarah', deadlineIso: '2026-07-25' }],
  openQuestions: ['Who owns the marketing plan?'],
};

/** Each text becomes one generateContent() response with fixed token metadata. */
function clientReturning(
  ...texts: string[]
): { client: GeminiClient; generateContent: ReturnType<typeof vi.fn> } {
  const generateContent = vi.fn();
  for (const text of texts) {
    generateContent.mockResolvedValueOnce({
      text,
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 },
    });
  }
  return { client: { models: { generateContent } }, generateContent };
}

describe('GeminiDocumentAdapter.generateDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validated content and summed token counts on the happy path', async () => {
    const { client, generateContent } = clientReturning(JSON.stringify(VALID_DOC));

    const res = await new GeminiDocumentAdapter(client).generateDocument(SEGMENTS, { meetingIsoDate: '2026-07-16' });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.content.title).toBe('Q3 Product Sync');
    expect(res.content.missed5.length).toBeGreaterThanOrEqual(3);
    expect(res.inputTokens).toBe(500);
    expect(res.outputTokens).toBe(200);
    expect(typeof res.model).toBe('string');
  });

  it('requests native JSON mode with temperature 0.2', async () => {
    const { client, generateContent } = clientReturning(JSON.stringify(VALID_DOC));

    await new GeminiDocumentAdapter(client).generateDocument(SEGMENTS, { meetingIsoDate: '2026-07-16' });

    expect(generateContent.mock.calls[0][0].config).toEqual(
      expect.objectContaining({ responseMimeType: 'application/json', temperature: 0.2 })
    );
  });

  it('retries ONCE with the validation errors appended, then succeeds — summing tokens across attempts', async () => {
    const { client, generateContent } = clientReturning('this is not json', JSON.stringify(VALID_DOC));

    const res = await new GeminiDocumentAdapter(client).generateDocument(SEGMENTS, { meetingIsoDate: '2026-07-16' });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(res.content.title).toBe('Q3 Product Sync');
    expect(res.inputTokens).toBe(1000); // 500 + 500
    expect(res.outputTokens).toBe(400); // 200 + 200
    // the second prompt carries the validation feedback
    expect(generateContent.mock.calls[1][0].contents as string).toContain('failed validation');
  });

  it('throws DocumentGenerationError when still invalid after the single retry — nothing saved', async () => {
    const { client, generateContent } = clientReturning('garbage', '{ still not valid }');

    await expect(
      new GeminiDocumentAdapter(client).generateDocument(SEGMENTS, { meetingIsoDate: '2026-07-16' })
    ).rejects.toBeInstanceOf(DocumentGenerationError);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('rejects an oversized transcript rather than calling the API', async () => {
    const { client, generateContent } = clientReturning(JSON.stringify(VALID_DOC));
    const huge: TranscriptSegment[] = [{ startMs: 0, endMs: 1000, speaker: 'X', text: 'x'.repeat(200_000) }];

    await expect(
      new GeminiDocumentAdapter(client).generateDocument(huge, { meetingIsoDate: '2026-07-16' })
    ).rejects.toBeInstanceOf(DocumentGenerationError);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('GeminiDocumentAdapter.generateSummary', () => {
  it('returns the plain-text summary, markdown stripped', async () => {
    const { client } = clientReturning('**The team** decided to ship chat first.');
    const summary = await new GeminiDocumentAdapter(client).generateSummary(SEGMENTS);
    expect(summary).toBe('The team decided to ship chat first.');
  });

  it('throws on an empty summary', async () => {
    const { client } = clientReturning('   ');
    await expect(new GeminiDocumentAdapter(client).generateSummary(SEGMENTS)).rejects.toBeInstanceOf(
      DocumentGenerationError
    );
  });
});

describe('buildDocumentPrompt (trust rules travel with the port)', () => {
  it('carries the anti-invention rules verbatim', () => {
    const p = buildDocumentPrompt(SEGMENTS, { meetingIsoDate: '2026-07-16' });
    expect(p).toContain('owner" MUST be spelled exactly as one of the speaker names');
    expect(p).toContain('ONLY if a specific date was explicitly spoken');
    expect(p).toContain('A Swedish meeting produces a Swedish document');
    expect(p).toContain('Sarah, Marcus'); // speaker allow-list
  });
});
