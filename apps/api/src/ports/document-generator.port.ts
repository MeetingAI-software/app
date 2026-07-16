import type { TranscriptSegment } from '../domain/types';
import type { DocumentContent } from '../domain/document';

export interface DocumentGeneratorPort {
  /** 3–5 plain sentences. No headings, no bullets. */
  generateSummary(segments: TranscriptSegment[]): Promise<string>;
  generateDocument(segments: TranscriptSegment[], meta: { meetingIsoDate: string }): Promise<{
    content: DocumentContent;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}
