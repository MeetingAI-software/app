import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { DocumentGenerationError } from '../../domain/errors';
import { documentContentSchema } from '../../domain/document.schema';
import type { DocumentContent } from '../../domain/document';
import type { DocumentGeneratorPort } from '../../ports/document-generator.port';
import type { TranscriptSegment } from '../../domain/types';
import { buildDocumentPrompt, buildRetryPrompt, buildSummaryPrompt, renderTranscript } from './prompts';

/** Documents should be boringly consistent, not creative. */
const TEMPERATURE = 0.2;
const SUMMARY_MAX_TOKENS = 400;
const DOCUMENT_MAX_TOKENS = 2000;

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/** Claude is told not to use markdown, but a stray fence or bullet must never reach the customer. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    // Horizontal whitespace only — \s* would swallow blank lines and collapse paragraphs.
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\w)[*_](.+?)[*_](?!\w)/g, '$1')
    .trim();
}

/** Claude is told to emit bare JSON; tolerate a fence or stray prose rather than fail the customer. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}

type ValidationOutcome =
  | { ok: true; content: DocumentContent }
  | { ok: false; issues: string };

function parseAndValidate(text: string): ValidationOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch (err) {
    return { ok: false, issues: `response was not valid JSON: ${(err as Error).message}` };
  }

  const result = documentContentSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, issues };
  }
  return { ok: true, content: result.data };
}

export class ClaudeAdapter implements DocumentGeneratorPort {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client =
      client ??
      new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        timeout: config.CLAUDE_TIMEOUT_MS, // milliseconds
      });
  }

  /** Never silently truncate a customer's meeting. */
  private guardTranscriptSize(segments: TranscriptSegment[]): void {
    const rendered = renderTranscript(segments);
    if (rendered.length > config.MAX_TRANSCRIPT_CHARS) {
      throw new DocumentGenerationError(
        `transcript too large: ${rendered.length} chars exceeds MAX_TRANSCRIPT_CHARS of ${config.MAX_TRANSCRIPT_CHARS}`
      );
    }
  }

  async generateSummary(segments: TranscriptSegment[]): Promise<string> {
    this.guardTranscriptSize(segments);

    const message = await this.client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: 'user', content: buildSummaryPrompt(segments) }],
    });

    logger.info(
      {
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        operation: 'generateSummary',
      },
      'Claude token usage'
    );

    const summary = stripMarkdown(extractText(message));
    if (!summary) {
      throw new DocumentGenerationError('Claude returned an empty summary');
    }
    return summary;
  }

  async generateDocument(
    segments: TranscriptSegment[],
    meta: { meetingIsoDate: string }
  ): Promise<{
    content: DocumentContent;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    this.guardTranscriptSize(segments);

    const basePrompt = buildDocumentPrompt(segments, meta);
    let prompt = basePrompt;

    // Tokens are summed across attempts: a retry costs real money and must show up in COGS.
    let inputTokens = 0;
    let outputTokens = 0;
    let model = config.CLAUDE_MODEL;
    let issues = '';

    // One attempt, then exactly one retry with the validation errors appended.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const message = await this.client.messages.create({
        model: config.CLAUDE_MODEL,
        max_tokens: DOCUMENT_MAX_TOKENS,
        temperature: TEMPERATURE,
        messages: [{ role: 'user', content: prompt }],
      });

      model = message.model;
      inputTokens += message.usage.input_tokens;
      outputTokens += message.usage.output_tokens;

      const outcome = parseAndValidate(extractText(message));
      if (outcome.ok) {
        logger.info(
          { model, inputTokens, outputTokens, attempts: attempt, operation: 'generateDocument' },
          'Claude token usage'
        );
        return { content: outcome.content, model, inputTokens, outputTokens };
      }

      issues = outcome.issues;
      logger.warn(
        { attempt, issues, operation: 'generateDocument' },
        'Claude document failed validation'
      );
      prompt = buildRetryPrompt(basePrompt, issues);
    }

    logger.error(
      { model, inputTokens, outputTokens, issues, operation: 'generateDocument' },
      'Claude document failed validation after retry — nothing saved'
    );
    throw new DocumentGenerationError(`document failed validation after retry: ${issues}`);
  }
}
