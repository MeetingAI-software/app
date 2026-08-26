import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from './chat.service';
import { MeetingNotReadyError, CapExceededError, ChatProviderError } from '../domain/errors';
import type { TranscriptRepository, ChatMessageRepository } from '../ports/repositories.port';
import type { MeetingChatPort, ChatMessage } from '../ports/chat.port';
import type { TranscriptSegment } from '../domain/types';
import { PLAN_ENTITLEMENTS } from '../domain/billing';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Speaker A', text: 'We agreed to ship chat first.' },
  { startMs: 2500, endMs: 5000, speaker: 'Speaker B', text: 'And delete audio after the summary.' },
];

const CAP = 2;

describe('ChatService', () => {
  let transcriptRepo: TranscriptRepository;
  let chatRepo: ChatMessageRepository;
  let chatAdapter: MeetingChatPort;
  let service: ChatService;

  beforeEach(() => {
    transcriptRepo = { save: vi.fn(), getByMeetingId: vi.fn(), deleteByMeeting: vi.fn() };
    chatRepo = { add: vi.fn(), listByMeeting: vi.fn(), countUserMessages: vi.fn(), deleteByMeeting: vi.fn() };
    chatAdapter = { answerQuestion: vi.fn() };
    service = new ChatService(transcriptRepo, chatRepo, chatAdapter, {
      getAccess: vi.fn().mockResolvedValue({
        plan: 'free', status: 'none', hasPaidAccess: false,
        entitlements: { ...PLAN_ENTITLEMENTS.free, chatQuestionsPerMeeting: CAP },
        subscription: null,
      }),
    });
  });

  describe('ask', () => {
    it('throws MeetingNotReadyError (409) when there is no transcript', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(null);

      await expect(service.ask('u1', 'm1', 'What did we decide?')).rejects.toThrow(MeetingNotReadyError);
      expect(chatRepo.add).not.toHaveBeenCalled();
      expect(chatAdapter.answerQuestion).not.toHaveBeenCalled();
    });

    it('throws MeetingNotReadyError (409) when the transcript is empty', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue([]);

      await expect(service.ask('u1', 'm1', 'What did we decide?')).rejects.toThrow(MeetingNotReadyError);
      expect(chatRepo.add).not.toHaveBeenCalled();
    });

    it('throws CapExceededError (429) when the meeting is at the question cap', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(CAP);

      await expect(service.ask('u1', 'm1', 'One more?')).rejects.toThrow(CapExceededError);
      expect(chatRepo.add).not.toHaveBeenCalled();
      expect(chatAdapter.answerQuestion).not.toHaveBeenCalled();
    });

    it('persists the question, answers it, persists the answer with tokens, and returns remaining', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockResolvedValue({
        answer: 'We ship chat first [00:00].',
        inputTokens: 120,
        outputTokens: 40,
      });

      const result = await service.ask('u1', 'm1', 'What did we decide?');

      expect(result).toEqual({ answer: 'We ship chat first [00:00].', remaining: 1 });
      expect(chatRepo.add).toHaveBeenNthCalledWith(1, 'm1', 'user', 'What did we decide?');
      expect(chatRepo.add).toHaveBeenNthCalledWith(2, 'm1', 'assistant', 'We ship chat first [00:00].', {
        input: 120,
        output: 40,
      });
    });

    it('passes the transcript and prior history to the adapter', async () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'Earlier question?' },
        { role: 'assistant', content: 'Earlier answer [00:01].' },
      ];
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(1);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue(history);
      vi.mocked(chatAdapter.answerQuestion).mockResolvedValue({
        answer: 'Follow-up answer [00:02].',
        inputTokens: 5,
        outputTokens: 3,
      });

      const result = await service.ask('u1', 'm1', 'Follow-up?');

      expect(chatAdapter.answerQuestion).toHaveBeenCalledWith(SEGMENTS, 'Follow-up?', history);
      expect(result.remaining).toBe(0); // cap 2, this was the 2nd question
    });

    // Regression, 2026-08-26: Gemini timed out and the customer still lost one of their questions
    // for the meeting — the cap counts user rows, and the question had already been written. A
    // provider failure must leave the meeting exactly as it found it.
    it('writes nothing when the provider fails, so the question is not burned', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockRejectedValue(new ChatProviderError());

      await expect(service.ask('u1', 'm1', 'What did we decide?')).rejects.toThrow(ChatProviderError);
      expect(chatRepo.add).not.toHaveBeenCalled();
    });

    it('reads history BEFORE persisting the new question (no self-echo)', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockResolvedValue({ answer: 'x', inputTokens: 0, outputTokens: 0 });

      await service.ask('u1', 'm1', 'q');

      const listOrder = vi.mocked(chatRepo.listByMeeting).mock.invocationCallOrder[0];
      const firstAddOrder = vi.mocked(chatRepo.add).mock.invocationCallOrder[0];
      expect(listOrder).toBeLessThan(firstAddOrder);
    });

    it('never returns a negative remaining', async () => {
      const oneQuestionService = new ChatService(transcriptRepo, chatRepo, chatAdapter, {
        getAccess: vi.fn().mockResolvedValue({
          plan: 'free', status: 'none', hasPaidAccess: false,
          entitlements: { ...PLAN_ENTITLEMENTS.free, chatQuestionsPerMeeting: 1 },
          subscription: null,
        }),
      });
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockResolvedValue({ answer: 'x', inputTokens: 0, outputTokens: 0 });

      const result = await oneQuestionService.ask('u1', 'm1', 'only question');

      expect(result.remaining).toBe(0);
    });
  });

  describe('getHistory', () => {
    it('returns the stored messages and the questions remaining', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Q1?' },
        { role: 'assistant', content: 'A1 [00:00].' },
      ];
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue(messages);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(1);

      const result = await service.getHistory('u1', 'm1');

      expect(result).toEqual({ messages, remaining: 1 });
    });

    it('reports full remaining and no messages for a meeting with no chat yet', async () => {
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);

      const result = await service.getHistory('u1', 'm1');

      expect(result).toEqual({ messages: [], remaining: CAP });
    });
  });
});
