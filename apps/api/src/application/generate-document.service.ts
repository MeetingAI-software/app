import type { DocumentRepository, MeetingRepository, TranscriptRepository } from '../ports/repositories.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import type { DocumentContent } from '../domain/document';
import { MeetingNotReadyError } from '../domain/errors';
import { logger } from '../config/logger';

export interface GenerateDocumentResult {
  content: DocumentContent;
  createdAt: Date;
  /** false when an existing document was returned untouched. */
  generated: boolean;
}

export class GenerateDocumentService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly transcriptRepo: TranscriptRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly docGen: DocumentGeneratorPort
  ) {}

  async generate(meetingId: string, regenerate = false): Promise<GenerateDocumentResult> {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new MeetingNotReadyError(`Meeting ${meetingId} not found`);
    }
    if (meeting.status !== 'transcribed') {
      throw new MeetingNotReadyError(
        `Meeting ${meetingId} is ${meeting.status}, not transcribed`
      );
    }

    if (!regenerate) {
      const existing = await this.documentRepo.getByMeetingId(meetingId);
      if (existing) {
        return { content: existing.content, createdAt: existing.createdAt, generated: false };
      }
    }

    const segments = await this.transcriptRepo.getByMeetingId(meetingId);
    if (!segments || segments.length === 0) {
      throw new MeetingNotReadyError(`Meeting ${meetingId} has no transcript`);
    }

    const result = await this.docGen.generateDocument(segments, {
      meetingIsoDate: meeting.createdAt.toISOString().slice(0, 10),
    });

    // The port has no meetingId, so COGS is correlated here where both are known.
    logger.info(
      {
        meetingId,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        regenerate,
      },
      'Document generated'
    );

    await this.documentRepo.upsertForMeeting(meetingId, result.content, {
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const saved = await this.documentRepo.getByMeetingId(meetingId);
    return {
      content: result.content,
      createdAt: saved?.createdAt ?? new Date(),
      generated: true,
    };
  }
}
