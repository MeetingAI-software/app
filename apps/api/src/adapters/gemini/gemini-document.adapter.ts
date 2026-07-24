import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { DocumentGenerationError } from '../../domain/errors';
import { documentContentSchema } from '../../domain/document.schema';
import type { DocumentContent } from '../../domain/document';
import type { DocumentGeneratorPort } from '../../ports/document-generator.port';
import type { TranscriptSegment } from '../../domain/types';
import type { GeminiClient } from './gemini-chat.adapter';
import { buildDocumentPrompt, buildRetryPrompt, buildSummaryPrompt, renderTranscript } from './prompts';

/** Documents should be boringly consistent, not creative. */
const TEMPERATURE = 0.2;
const SUMMARY_MAX_TOKENS = 400;
const DOCUMENT_MAX_TOKENS = 2000;

/** Told to emit plain text, but a stray fence or bullet must never reach the customer. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\w)[*_](.+?)[*_](?!\w)/g, '$1')
    .trim();
}

/** JSON mode should return bare JSON; tolerate a fence or stray prose rather than fail the customer. */
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

export class GeminiDocumentAdapter implements DocumentGeneratorPort {
  private readonly client: GeminiClient;

  constructor(client?: GeminiClient) {
    this.client =
      client ??
      (new GoogleGenAI({
        apiKey: config.GEMINI_API_KEY,
        httpOptions: { timeout: config.CLAUDE_TIMEOUT_MS }, // shared LLM request timeout (ms)
      }) as unknown as GeminiClient);
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

    const startedAt = Date.now();
    const response = await this.client.models.generateContent({
      model: config.GEMINI_DOC_MODEL,
      contents: buildSummaryPrompt(segments),
      config: { temperature: TEMPERATURE, maxOutputTokens: SUMMARY_MAX_TOKENS },
    });

    logger.info(
      {
        model: config.GEMINI_DOC_MODEL,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - startedAt,
        operation: 'generateSummary',
      },
      'Gemini token usage'
    );

    const summary = stripMarkdown((response.text ?? '').trim());
    if (!summary) {
      throw new DocumentGenerationError('Gemini returned an empty summary');
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
    const model = config.GEMINI_DOC_MODEL;
    let issues = '';
    const startedAt = Date.now();

    // One attempt, then exactly one retry with the validation errors appended — identical to Day 2.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: TEMPERATURE,
          maxOutputTokens: DOCUMENT_MAX_TOKENS,
          responseMimeType: 'application/json', // Gemini native structured-output/JSON mode
        },
      });

      inputTokens += response.usageMetadata?.promptTokenCount ?? 0;
      outputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

      const outcome = parseAndValidate((response.text ?? '').trim());
      if (outcome.ok) {
        logger.info(
          { model, inputTokens, outputTokens, attempts: attempt, latencyMs: Date.now() - startedAt, operation: 'generateDocument' },
          'Gemini token usage'
        );
        return { content: outcome.content, model, inputTokens, outputTokens };
      }

      issues = outcome.issues;
      logger.warn({ attempt, issues, operation: 'generateDocument' }, 'Gemini document failed validation');
      prompt = buildRetryPrompt(basePrompt, issues);
    }

    logger.error(
      { model, inputTokens, outputTokens, issues, operation: 'generateDocument' },
      'Gemini document failed validation after retry — nothing saved'
    );
    throw new DocumentGenerationError(`document failed validation after retry: ${issues}`);
  }
}
