import { config } from '../../config/env';
import type { DocumentGeneratorPort } from '../../ports/document-generator.port';
import type { TranscriptSegment } from '../../domain/types';
import type { DocumentContent } from '../../domain/document';
import { DocumentGenerationError } from '../../domain/errors';

export class ClaudeDocumentGeneratorAdapter implements DocumentGeneratorPort {
  private getHeaders(): Record<string, string> {
    const apiKey = config.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  async generateSummary(segments: TranscriptSegment[]): Promise<string> {
    const transcriptText = segments
      .map(s => `[${s.startMs}ms - ${s.endMs}ms] ${s.speaker}: ${s.text}`)
      .join('\n');

    const prompt = `You are a meeting summarizer. Generate a 3-5 sentence summary of the following meeting transcript. Do not use headings or bullet points. Output only the plain text summary.

Transcript:
${transcriptText}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: config.CLAUDE_MODEL,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API returned ${response.status}: ${errText}`);
      }

      const resData = await response.json() as any;
      const textContent = resData.content?.[0]?.text;
      if (!textContent) {
        throw new Error('No content returned from Anthropic');
      }
      return textContent.trim();
    } catch (err: any) {
      throw new DocumentGenerationError(`Failed to generate summary: ${err.message}`);
    }
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
    const transcriptText = segments
      .map(s => `[${s.startMs}ms - ${s.endMs}ms] ${s.speaker}: ${s.text}`)
      .join('\n');

    const prompt = `You are a meeting assistant. Generate a structured JSON document representing the meeting transcript.
The meeting took place on ${meta.meetingIsoDate}.

Your output MUST be a valid JSON object matching this schema:
{
  "title": "short + specific, e.g. 'Q3 Budget Planning — 15 Jul 2026'",
  "missed5": ["3 to 5 bullet points summarizing key points for someone who was absent. Each bullet must be at least 5 characters."],
  "decisions": ["things actually decided, not merely discussed. Each must be at least 3 characters."],
  "actionPoints": [
    {
      "task": "description of task, min 3 characters",
      "owner": "MUST be a speaker name from the transcript (or null if unidentified). Do not invent names.",
      "deadlineIso": "date in YYYY-MM-DD format (or null if not explicitly stated). Do not invent dates."
    }
  ],
  "openQuestions": ["unresolved / parked items, min 3 characters"]
}

Ensure the output is ONLY the JSON object. Do not wrap in markdown code blocks.

Transcript:
${transcriptText}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: config.CLAUDE_MODEL,
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API returned ${response.status}: ${errText}`);
      }

      const resData = await response.json() as any;
      const textContent = resData.content?.[0]?.text;
      if (!textContent) {
        throw new Error('No content returned from Anthropic');
      }

      const jsonStr = textContent.trim();
      const content = JSON.parse(jsonStr) as DocumentContent;

      return {
        content,
        model: config.CLAUDE_MODEL,
        inputTokens: resData.usage?.input_tokens || 0,
        outputTokens: resData.usage?.output_tokens || 0,
      };
    } catch (err: any) {
      throw new DocumentGenerationError(`Failed to generate document: ${err.message}`);
    }
  }
}
