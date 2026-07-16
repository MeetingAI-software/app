import type { DocumentGeneratorPort } from '../../ports/document-generator.port';
import type { TranscriptSegment } from '../../domain/types';
import type { DocumentContent } from '../../domain/document';

export class FakeDocumentGeneratorAdapter implements DocumentGeneratorPort {
  async generateSummary(segments: TranscriptSegment[]): Promise<string> {
    return 'This is a simulated summary of the meeting, discussing the integration of Recall.ai and PostgreSQL repositories in Frankfurt.';
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
    const content: DocumentContent = {
      title: `Meeting AI Discussion — ${meta.meetingIsoDate}`,
      missed5: [
        'Alper welcomed everyone and introduced the start of the meeting.',
        'AbdulRehman announced that the Recall.ai adapter was successfully configured.',
        'Alper confirmed that the database schema and Express routing were fully complete.',
        'AbdulRehman proposed running integration tests against the EU database region.',
        'The team agreed that the PostgreSQL pipeline is functioning perfectly.',
      ],
      decisions: [
        'Use PostgreSQL in Frankfurt/Stockholm (EU region) for GPDR compliance.',
        'Implement structured JSON documents rather than freeform markdown for rendering.',
      ],
      actionPoints: [
        {
          task: 'Run integration tests against the EU-central database',
          owner: 'AbdulRehman Khan',
          deadlineIso: '2026-07-18',
        },
        {
          task: 'Configure CORS and verify signature validation',
          owner: 'Alper Eken',
          deadlineIso: null,
        },
      ],
      openQuestions: [
        'How should we structure versioning for post-customer documents?',
      ],
    };

    return {
      content,
      model: 'fake-claude-3-5-sonnet',
      inputTokens: 120,
      outputTokens: 450,
    };
  }
}
