import type { TranscriptRepository, ChatMessageRepository } from '../ports/repositories.port';
import type { MeetingChatPort, ChatMessage } from '../ports/chat.port';
import { MeetingNotReadyError, CapExceededError } from '../domain/errors';
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
    private readonly chatRepo: ChatMessageRepository,
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

    // 2. Enforce the per-meeting cap (each question re-reads the whole meeting — it costs money).
    const asked = await this.chatRepo.countUserMessages(meetingId);
    if (asked >= maxQuestionsPerMeeting) {
      throw new CapExceededError('Question limit reached for this meeting');
    }

    // 3. Prior turns become the model's conversation memory (oldest first).
    const history = await this.chatRepo.listByMeeting(meetingId);

    // 4. Answer first, THEN persist the exchange. Writing the question up front made a provider
    //    outage cost the customer one of their questions for this meeting — the cap counts user
    //    rows — and left it sitting in the history with nothing under it. A failed question now
    //    costs nothing and leaves no trace, so retrying is free.
    const { answer, inputTokens, outputTokens } = await this.chatAdapter.answerQuestion(
      segments,
      question,
      history
    );
    await this.chatRepo.add(meetingId, 'user', question);
    await this.chatRepo.add(meetingId, 'assistant', answer, {
      input: inputTokens,
      output: outputTokens,
    });

    const remaining = Math.max(0, maxQuestionsPerMeeting - (asked + 1));

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
