import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiChatAdapter, type GeminiClient } from './gemini-chat.adapter';
import { buildChatSystemPrompt } from './prompts';
import type { TranscriptSegment } from '../../domain/types';
import type { ChatMessage } from '../../ports/chat.port';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Speaker A', text: 'We agreed to ship chat first.' },
  { startMs: 134000, endMs: 138000, speaker: 'Speaker B', text: 'Delete audio after the summary.' },
];

function clientReturning(
  text: string,
  promptTokenCount = 300,
  candidatesTokenCount = 40
): { client: GeminiClient; generateContent: ReturnType<typeof vi.fn> } {
  const generateContent = vi.fn().mockResolvedValue({
    text,
    usageMetadata: { promptTokenCount, candidatesTokenCount },
  });
  return { client: { models: { generateContent } }, generateContent };
}

describe('GeminiChatAdapter.answerQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the answer text and the token counts from usageMetadata', async () => {
    const { client, generateContent } = clientReturning('We ship chat first [00:00].', 300, 40);

    const result = await new GeminiChatAdapter(client).answerQuestion(SEGMENTS, 'What first?', []);

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      answer: 'We ship chat first [00:00].',
      inputTokens: 300,
      outputTokens: 40,
    });
  });

  it('grounds on the transcript by putting it and the rules in the system instruction', async () => {
    const { client, generateContent } = clientReturning('answer');

    await new GeminiChatAdapter(client).answerQuestion(SEGMENTS, 'q', []);

    const systemInstruction = generateContent.mock.calls[0][0].config.systemInstruction as string;
    expect(systemInstruction).toContain('[00:00] Speaker A: We agreed to ship chat first.');
    expect(systemInstruction).toContain('ONLY from the transcript');
  });

  it('sends prior history mapped to user/model, then the new question as the last user turn', async () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Earlier?' },
      { role: 'assistant', content: 'Earlier answer [00:00].' },
    ];
    const { client, generateContent } = clientReturning('answer');

    await new GeminiChatAdapter(client).answerQuestion(SEGMENTS, 'And then?', history);

    expect(generateContent.mock.calls[0][0].contents).toEqual([
      { role: 'user', parts: [{ text: 'Earlier?' }] },
      { role: 'model', parts: [{ text: 'Earlier answer [00:00].' }] },
      { role: 'user', parts: [{ text: 'And then?' }] },
    ]);
  });

  it('sends temperature 0.2 and a bounded maxOutputTokens', async () => {
    const { client, generateContent } = clientReturning('answer');

    await new GeminiChatAdapter(client).answerQuestion(SEGMENTS, 'q', []);

    expect(generateContent.mock.calls[0][0].config).toEqual(
      expect.objectContaining({ temperature: 0.2, maxOutputTokens: 500 })
    );
  });

  it('throws when Gemini returns an empty answer', async () => {
    const { client } = clientReturning('   ');

    await expect(
      new GeminiChatAdapter(client).answerQuestion(SEGMENTS, 'q', [])
    ).rejects.toThrow(/empty/i);
  });

  it('rejects an oversized transcript rather than calling the API', async () => {
    const { client, generateContent } = clientReturning('answer');
    const huge: TranscriptSegment[] = [
      { startMs: 0, endMs: 1000, speaker: 'Speaker A', text: 'x'.repeat(200_000) },
    ];

    await expect(new GeminiChatAdapter(client).answerQuestion(huge, 'q', [])).rejects.toThrow(
      /transcript too large/
    );
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('buildChatSystemPrompt (grounding rules travel with the port)', () => {
  it('carries every grounding rule verbatim', () => {
    const p = buildChatSystemPrompt(SEGMENTS);
    expect(p).toContain('ONLY from the transcript');
    expect(p).toContain('[mm:ss]');
    expect(p).toContain("That wasn't discussed in this meeting.");
    expect(p).toContain('same language the question is asked in');
  });
});

// Hits the real Gemini API. Run on demand with:
//   RUN_LIVE_GEMINI=1 GEMINI_API_KEY=... GEMINI_CHAT_MODEL=... npx vitest run src/adapters/gemini/gemini-chat.adapter.test.ts
describe.skipIf(!process.env.RUN_LIVE_GEMINI)('GeminiChatAdapter (live API)', () => {
  it('answers a grounded question from the transcript', async () => {
    const adapter = new GeminiChatAdapter();
    const result = await adapter.answerQuestion(SEGMENTS, 'What did the team agree to ship first?', []);
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
  }, 90_000);

  it('declines to answer something that was not in the meeting', async () => {
    const adapter = new GeminiChatAdapter();
    const result = await adapter.answerQuestion(SEGMENTS, 'What is the capital of France?', []);
    expect(result.answer.toLowerCase()).toMatch(/wasn't|was not|not discussed|no mention|not in/i);
  }, 90_000);
});
