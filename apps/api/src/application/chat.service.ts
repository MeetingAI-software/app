import type { TranscriptRepository, ChatQuestionRepository } from '../ports/repositories.port';
import { ChatPreflightError, type MeetingChatPort, type ChatMessage } from '../ports/chat.port';
import { MeetingNotReadyError, ChatProviderError } from '../domain/errors';
import { logger } from '../config/logger';
import type { BillingAccessProvider } from '../domain/billing';

export interface ChatAnswer {
  answer: string;
  remaining: number;   // questions left for this meeting after this one
}

export interface ChatHistory {
  messages: ChatMessage[];
  remaining: number;
}

/**
 * Grounded meeting chat. Answers come ONLY from the transcript (the adapter enforces that);
 * this service owns the business rules: transcript must exist (409) and the per-meeting
 * question cap (429). The cap comes from the authenticated owner's current plan.
 */
export class ChatService {
  constructor(
    private readonly transcriptRepo: TranscriptRepository,
    private readonly chatRepo: ChatQuestionRepository,
    private readonly chatAdapter: MeetingChatPort,
    private readonly billingAccess: BillingAccessProvider,
  ) {}

  async ask(userId: string, meetingId: string, question: string): Promise<ChatAnswer> {
    const { entitlements } = await this.billingAccess.getAccess(userId);
    const maxQuestionsPerMeeting = entitlements.chatQuestionsPerMeeting;
    // 1. The chat is grounded — no transcript, nothing to answer from.
    const segments = await this.transcriptRepo.getByMeetingId(meetingId);
    if (!segments || segments.length === 0) {
      throw new MeetingNotReadyError('Transcript is not ready for this meeting yet');
    }

    // Claim capacity in Postgres before paid model work. A pending claim is hidden from history
    // but counts toward the cap, including across API replicas and after a worker crash.
    const claim = await this.chatRepo.claimQuestion(meetingId, maxQuestionsPerMeeting, question);
    let history: ChatMessage[];
    try {
      history = await this.chatRepo.listByMeeting(meetingId);
    } catch (err) {
      // No provider call was started, so this claim cannot represent paid model work.
      await this.chatRepo.releaseQuestion(claim.id);
      throw err;
    }

    // After entering the adapter, an error may mean a charged response was lost or empty.
    // Count that attempt without keeping it in flight, so later questions can use remaining capacity.
    let result: Awaited<ReturnType<MeetingChatPort['answerQuestion']>>;
    try {
      result = await this.chatAdapter.answerQuestion(segments, question, history);
    } catch (err) {
      if (err instanceof ChatPreflightError) {
        await this.chatRepo.releaseQuestion(claim.id);
      } else {
        await this.chatRepo.markQuestionOutcomeUnknown(claim.id);
        if (err instanceof ChatProviderError) {
          throw new ChatProviderError(
            'The AI response could not be confirmed. This question counted toward the meeting limit.'
          );
        }
      }
      throw err;
    }

    // A persistence fault after a successful model call may have committed ambiguously. Keep
    // the claim rather than admitting another paid question; reconciliation can recover it.
    await this.chatRepo.completeQuestion(claim.id, result.answer, {
      input: result.inputTokens, output: result.outputTokens,
    });
    const { answer, inputTokens, outputTokens } = result;
    const remaining = claim.remaining;

    logger.info(
      { meetingId, inputTokens, outputTokens, remaining },
      'Chat question answered'
    );

    return { answer, remaining };
  }

  async getHistory(userId: string, meetingId: string): Promise<ChatHistory> {
    const { entitlements } = await this.billingAccess.getAccess(userId);
    const messages = await this.chatRepo.listByMeeting(meetingId);
    const asked = await this.chatRepo.countUserMessages(meetingId);
    const remaining = Math.max(0, entitlements.chatQuestionsPerMeeting - asked);
    return { messages, remaining };
  }
}
