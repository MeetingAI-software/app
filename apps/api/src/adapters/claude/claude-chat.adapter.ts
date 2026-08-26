import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { ChatProviderError } from '../../domain/errors';
import { callChatProvider } from '../chat-retry';
import type { MeetingChatPort, ChatMessage } from '../../ports/chat.port';
import type { TranscriptSegment } from '../../domain/types';
import { buildChatSystemPrompt } from './chat-prompts';
import { renderTranscript } from './prompts';

/** Grounded answers must be factual and consistent, not creative. */
const TEMPERATURE = 0.2;
const CHAT_MAX_TOKENS = 500;

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

export class ClaudeChatAdapter implements MeetingChatPort {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client =
      client ??
      new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        timeout: config.CHAT_TIMEOUT_MS, // ms — shorter than docs; someone is waiting
      });
  }

  /** Never silently truncate a customer's meeting — same guard as the Day 2 document adapter. */
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

    // Transcript = grounding source, in the system prompt. Prior turns + the new question = messages.
    const system = buildChatSystemPrompt(segments);
    const messages: Anthropic.MessageParam[] = [
      ...history.map((m): Anthropic.MessageParam => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ];

    const message = await callChatProvider('claude', () =>
      this.client.messages.create({
        model: config.CLAUDE_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages,
      })
    );

    logger.info(
      {
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        operation: 'answerQuestion',
      },
      'Claude token usage'
    );

    // A 200 with nothing in it is still a provider failure from the customer's side, and the fix
    // is the same one: ask again.
    const answer = extractText(message);
    if (!answer) {
      logger.warn({ model: message.model }, 'Claude returned an empty chat answer');
      throw new ChatProviderError();
    }

    return {
      answer,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}
