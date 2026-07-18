import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeChatAdapter } from './claude-chat.adapter';
import type { TranscriptSegment } from '../../domain/types';
import type { ChatMessage } from '../../ports/chat.port';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Speaker A', text: 'We agreed to ship chat first.' },
  { startMs: 134000, endMs: 138000, speaker: 'Speaker B', text: 'Delete audio after the summary.' },
];

function messageWith(text: string, inputTokens = 300, outputTokens = 40): Anthropic.Message {
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

describe('ClaudeChatAdapter.answerQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the answer text and the token counts', async () => {
    const { client, create } = clientReturning('We ship chat first [00:00].');

    const result = await new ClaudeChatAdapter(client).answerQuestion(SEGMENTS, 'What first?', []);

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      answer: 'We ship chat first [00:00].',
      inputTokens: 300,
      outputTokens: 40,
    });
  });

  it('grounds on the transcript by putting it and the rules in the system prompt', async () => {
    const { client, create } = clientReturning('answer');

    await new ClaudeChatAdapter(client).answerQuestion(SEGMENTS, 'q', []);

    const system = create.mock.calls[0][0].system as string;
    expect(system).toContain('[00:00] Speaker A: We agreed to ship chat first.');
    expect(system).toContain('ONLY from the transcript');
  });

  it('sends prior history followed by the new question as the last user message', async () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Earlier?' },
      { role: 'assistant', content: 'Earlier answer [00:00].' },
    ];
    const { client, create } = clientReturning('answer');

    await new ClaudeChatAdapter(client).answerQuestion(SEGMENTS, 'And then?', history);

    expect(create.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'Earlier?' },
      { role: 'assistant', content: 'Earlier answer [00:00].' },
      { role: 'user', content: 'And then?' },
    ]);
  });

  it('sends temperature 0.2 and a bounded max_tokens', async () => {
    const { client, create } = clientReturning('answer');

    await new ClaudeChatAdapter(client).answerQuestion(SEGMENTS, 'q', []);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2, max_tokens: 1024 })
    );
  });

  it('throws when Claude returns an empty answer', async () => {
    const { client } = clientReturning('   ');

    await expect(
      new ClaudeChatAdapter(client).answerQuestion(SEGMENTS, 'q', [])
    ).rejects.toThrow(/empty/i);
  });
});

// Hits the real Anthropic API. Run on demand with:
//   RUN_LIVE_CLAUDE=1 npx vitest run src/adapters/claude/claude-chat.adapter.test.ts
describe.skipIf(!process.env.RUN_LIVE_CLAUDE)('ClaudeChatAdapter (live API)', () => {
  it('answers a grounded question from the transcript', async () => {
    const adapter = new ClaudeChatAdapter();

    const result = await adapter.answerQuestion(
      SEGMENTS,
      'What did the team agree to ship first?',
      []
    );

    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
  }, 90_000);

  it('declines to answer something that was not in the meeting', async () => {
    const adapter = new ClaudeChatAdapter();

    const result = await adapter.answerQuestion(SEGMENTS, 'What is the capital of France?', []);

    expect(result.answer.toLowerCase()).toMatch(/wasn't|was not|not discussed|no mention|not in/i);
  }, 90_000);
});
