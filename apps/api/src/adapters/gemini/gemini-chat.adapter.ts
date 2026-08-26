import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { ChatProviderError } from '../../domain/errors';
import { callChatProvider } from '../chat-retry';
import type { MeetingChatPort, ChatMessage } from '../../ports/chat.port';
import type { TranscriptSegment } from '../../domain/types';
import { buildChatSystemPrompt, renderTranscript } from './prompts';

/** Grounded answers must be factual and consistent, not creative. */
const TEMPERATURE = 0.2;
const CHAT_MAX_TOKENS = 500;

/**
 * The slice of the @google/genai client this adapter uses. Declaring it lets tests inject a fake
 * without the real SDK, and keeps the vendor surface we depend on tiny and explicit.
 */
export interface GeminiClient {
  models: {
    generateContent(params: {
      model: string;
      contents: unknown;
      config?: Record<string, unknown>;
    }): Promise<{
      text?: string;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    }>;
  };
}

/** Gemini roles are 'user' | 'model' — map our 'assistant' onto 'model'. */
function toGeminiContents(history: ChatMessage[], question: string) {
  return [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: question }] },
  ];
}

export class GeminiChatAdapter implements MeetingChatPort {
  private readonly client: GeminiClient;

  constructor(client?: GeminiClient) {
    this.client =
      client ??
      (new GoogleGenAI({
        apiKey: config.GEMINI_API_KEY,
        httpOptions: { timeout: config.CHAT_TIMEOUT_MS }, // ms — shorter than docs; someone is waiting
      }) as unknown as GeminiClient);
  }

  /** Never silently truncate a customer's meeting — same guard as the Claude chat adapter. */
  private guardTranscriptSize(segments: TranscriptSegment[]): void {
    const rendered = renderTranscript(segments);
    if (rendered.length > config.MAX_TRANSCRIPT_CHARS) {
      throw new Error(
        `transcript too large: ${rendered.length} chars exceeds MAX_TRANSCRIPT_CHARS of ${config.MAX_TRANSCRIPT_CHARS}`
      );
    }
  }

  async answerQuestion(
    segments: TranscriptSegment[],
    question: string,
    history: ChatMessage[]
  ): Promise<{ answer: string; inputTokens: number; outputTokens: number }> {
    this.guardTranscriptSize(segments);

    // Transcript = grounding source, in the system instruction. Prior turns + the new question = contents.
    const systemInstruction = buildChatSystemPrompt(segments);
    const contents = toGeminiContents(history, question);

    const response = await callChatProvider('gemini', () =>
      this.client.models.generateContent({
        model: config.GEMINI_CHAT_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: TEMPERATURE,
          maxOutputTokens: CHAT_MAX_TOKENS,
        },
      })
    );

    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    logger.info(
      { model: config.GEMINI_CHAT_MODEL, inputTokens, outputTokens, operation: 'answerQuestion' },
      'Gemini token usage'
    );

    // A 200 with nothing in it is still a provider failure from the customer's side, and the fix
    // is the same one: ask again.
    const answer = (response.text ?? '').trim();
    if (!answer) {
      logger.warn({ model: config.GEMINI_CHAT_MODEL }, 'Gemini returned an empty chat answer');
      throw new ChatProviderError();
    }

    return { answer, inputTokens, outputTokens };
  }
}
