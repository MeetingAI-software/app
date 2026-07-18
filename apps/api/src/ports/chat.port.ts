import type { TranscriptSegment } from '../domain/types';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export interface MeetingChatPort {
  /** Answer from the transcript ONLY. Cite [mm:ss] inline. Say plainly when the
   *  answer is not in the meeting. Respond in the language of the question. */
  answerQuestion(segments: TranscriptSegment[], question: string, history: ChatMessage[]):
    Promise<{ answer: string; inputTokens: number; outputTokens: number }>;
}
