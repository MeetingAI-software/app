import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeAdapter } from './claude.adapter';
import { DocumentGenerationError } from '../../domain/errors';
import type { TranscriptSegment } from '../../domain/types';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Alper Eken', text: 'Budget approved at 40k.' },
  { startMs: 2500, endMs: 5000, speaker: 'AbdulRehman Khan', text: 'I will own the breakdown by Friday.' },
];

const META = { meetingIsoDate: '2026-07-16' };

const VALID_DOCUMENT = {
  title: 'Budget Review — 16 Jul 2026',
  missed5: [
    'Budget approved at 40k with no further review needed.',
    'AbdulRehman owns the cost breakdown and committed to Friday.',
    'No blockers were raised against the current plan.',
  ],
  decisions: ['Approve the budget at 40k.'],
  actionPoints: [
    { task: 'Produce the cost breakdown.', owner: 'AbdulRehman Khan', deadlineIso: null },
  ],
  openQuestions: ['Whether the 40k covers Q4 as well.'],
};

function messageWith(text: string, inputTokens = 100, outputTokens = 50): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  } as unknown as Anthropic.Message;
}

function clientReturning(...texts: string[]): { client: Anthropic; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn();
  for (const text of texts) {
    create.mockResolvedValueOnce(messageWith(text));
  }
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

describe('ClaudeAdapter.generateDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validated content and token counts on the first attempt', async () => {
    const { client, create } = clientReturning(JSON.stringify(VALID_DOCUMENT));
    const adapter = new ClaudeAdapter(client);

    const result = await adapter.generateDocument(SEGMENTS, META);

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.content.title).toBe('Budget Review — 16 Jul 2026');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it('sends temperature 0.2 and max_tokens 2000', async () => {
    const { client, create } = clientReturning(JSON.stringify(VALID_DOCUMENT));
    await new ClaudeAdapter(client).generateDocument(SEGMENTS, META);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2, max_tokens: 2000 })
    );
  });

  it('tolerates a code fence around otherwise valid JSON', async () => {
    const { client } = clientReturning('```json\n' + JSON.stringify(VALID_DOCUMENT) + '\n```');

    const result = await new ClaudeAdapter(client).generateDocument(SEGMENTS, META);

    expect(result.content.decisions).toEqual(['Approve the budget at 40k.']);
  });

  it('retries once with the errors appended when the response is not JSON', async () => {
    const { client, create } = clientReturning('I am afraid I cannot do that.', JSON.stringify(VALID_DOCUMENT));

    const result = await new ClaudeAdapter(client).generateDocument(SEGMENTS, META);

    expect(create).toHaveBeenCalledTimes(2);
    const retryPrompt = create.mock.calls[1][0].messages[0].content;
    expect(retryPrompt).toContain('Your previous output failed validation with these errors:');
    expect(retryPrompt).toContain('Output ONLY corrected JSON.');
    expect(result.content.title).toBe('Budget Review — 16 Jul 2026');
  });

  it('retries once with the Zod issues appended when the JSON fails the schema', async () => {
    const tooFewBullets = { ...VALID_DOCUMENT, missed5: ['only one bullet here'] };
    const { client, create } = clientReturning(
      JSON.stringify(tooFewBullets),
      JSON.stringify(VALID_DOCUMENT)
    );

    await new ClaudeAdapter(client).generateDocument(SEGMENTS, META);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[0].content).toContain('missed5');
  });

  it('sums tokens across the retry so a retry shows up in COGS', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(messageWith('not json', 100, 50))
      .mockResolvedValueOnce(messageWith(JSON.stringify(VALID_DOCUMENT), 120, 60));
    const client = { messages: { create } } as unknown as Anthropic;

    const result = await new ClaudeAdapter(client).generateDocument(SEGMENTS, META);

    expect(result.inputTokens).toBe(220);
    expect(result.outputTokens).toBe(110);
  });

  it('throws DocumentGenerationError after the retry, saving nothing half-valid', async () => {
    const { client, create } = clientReturning('still not json', '{ "title": "too short to pass" }');
    const adapter = new ClaudeAdapter(client);

    await expect(adapter.generateDocument(SEGMENTS, META)).rejects.toThrow(DocumentGenerationError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('never retries more than once', async () => {
    const { client, create } = clientReturning('bad', 'bad');
    await expect(new ClaudeAdapter(client).generateDocument(SEGMENTS, META)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('rejects an oversized transcript rather than truncating it', async () => {
    const { client, create } = clientReturning(JSON.stringify(VALID_DOCUMENT));
    const huge: TranscriptSegment[] = [
      { startMs: 0, endMs: 1000, speaker: 'A', text: 'x'.repeat(200_000) },
    ];

    await expect(new ClaudeAdapter(client).generateDocument(huge, META)).rejects.toThrow(
      /transcript too large/
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ClaudeAdapter.generateSummary', () => {
  it('strips markdown Claude may add', async () => {
    const { client } = clientReturning('## Summary\n\n- **Budget** approved at 40k.');

    const summary = await new ClaudeAdapter(client).generateSummary(SEGMENTS);

    expect(summary).toBe('Summary\n\nBudget approved at 40k.');
  });

  it('sends max_tokens 400', async () => {
    const { client, create } = clientReturning('Budget approved at 40k.');
    await new ClaudeAdapter(client).generateSummary(SEGMENTS);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 400 }));
  });

  it('throws when Claude returns an empty summary', async () => {
    const { client } = clientReturning('   ');

    await expect(new ClaudeAdapter(client).generateSummary(SEGMENTS)).rejects.toThrow(
      DocumentGenerationError
    );
  });

  it('rejects an oversized transcript', async () => {
    const { client } = clientReturning('anything');
    const huge: TranscriptSegment[] = [
      { startMs: 0, endMs: 1000, speaker: 'A', text: 'x'.repeat(200_000) },
    ];

    await expect(new ClaudeAdapter(client).generateSummary(huge)).rejects.toThrow(
      /transcript too large/
    );
  });
});

// Hits the real Anthropic API. Run on demand with:
//   RUN_LIVE_CLAUDE=1 npx vitest run src/adapters/claude/claude.adapter.test.ts
describe.skipIf(!process.env.RUN_LIVE_CLAUDE)('ClaudeAdapter (live API)', () => {
  it('produces a document that passes the Zod gate', async () => {
    const adapter = new ClaudeAdapter();

    const result = await adapter.generateDocument(SEGMENTS, META);

    expect(result.content.missed5.length).toBeGreaterThanOrEqual(3);
    expect(result.inputTokens).toBeGreaterThan(0);
    // The trust rule: an owner must be a real speaker, or null.
    for (const point of result.content.actionPoints) {
      if (point.owner !== null) {
        expect(SEGMENTS.map((s) => s.speaker)).toContain(point.owner);
      }
    }
  }, 90_000);
});
