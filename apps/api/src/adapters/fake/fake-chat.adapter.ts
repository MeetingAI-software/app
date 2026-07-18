import type { MeetingChatPort, ChatMessage } from '../../ports/chat.port';
import type { TranscriptSegment } from '../../domain/types';

// Canned, grounded-sounding answer with one [mm:ss] citation — enough for Alper to build
// and style the chat panel (history, counter, [mm:ss] badges) without spending a cent on Claude.
const CANNED_ANSWER =
  'The team agreed to delete the audio after the summary succeeds, so the GDPR promise holds on the upload path too [02:14]. The transcript stays the source of truth.';

export class FakeChatAdapter implements MeetingChatPort {
  async answerQuestion(
    _segments: TranscriptSegment[],
    _question: string,
    _history: ChatMessage[]
  ): Promise<{ answer: string; inputTokens: number; outputTokens: number }> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      answer: CANNED_ANSWER,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}
