import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from './chat.service';
import { MeetingNotReadyError, CapExceededError, ChatProviderError } from '../domain/errors';
import type { TranscriptRepository, ChatQuestionRepository } from '../ports/repositories.port';
import type { MeetingChatPort, ChatMessage } from '../ports/chat.port';
import type { TranscriptSegment } from '../domain/types';
import { PLAN_ENTITLEMENTS } from '../domain/billing';
import { config } from '../config/env';
import { GeminiChatAdapter, type GeminiClient } from '../adapters/gemini/gemini-chat.adapter';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Speaker A', text: 'We agreed to ship chat first.' },
  { startMs: 2500, endMs: 5000, speaker: 'Speaker B', text: 'And delete audio after the summary.' },
];

const CAP = 2;

describe('ChatService', () => {
  let transcriptRepo: TranscriptRepository;
  let chatRepo: ChatQuestionRepository;
  let chatAdapter: MeetingChatPort;
  let service: ChatService;

  beforeEach(() => {
    transcriptRepo = { save: vi.fn(), getByMeetingId: vi.fn(), deleteByMeeting: vi.fn() };
    chatRepo = { claimQuestion: vi.fn().mockResolvedValue({ id: 'claim-1', remaining: 1 }),
      completeQuestion: vi.fn(), releaseQuestion: vi.fn(), markQuestionOutcomeUnknown: vi.fn(),
      add: vi.fn(), listByMeeting: vi.fn(), countUserMessages: vi.fn(), deleteByMeeting: vi.fn() };
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
      expect(chatRepo.claimQuestion).not.toHaveBeenCalled();
      expect(chatAdapter.answerQuestion).not.toHaveBeenCalled();
    });

    it('throws MeetingNotReadyError (409) when the transcript is empty', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue([]);

      await expect(service.ask('u1', 'm1', 'What did we decide?')).rejects.toThrow(MeetingNotReadyError);
      expect(chatRepo.claimQuestion).not.toHaveBeenCalled();
    });

    it('throws CapExceededError (429) when the meeting is at the question cap', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.claimQuestion).mockRejectedValue(new CapExceededError('Question limit reached'));

      await expect(service.ask('u1', 'm1', 'One more?')).rejects.toThrow(CapExceededError);
      expect(chatRepo.completeQuestion).not.toHaveBeenCalled();
      expect(chatAdapter.answerQuestion).not.toHaveBeenCalled();
    });

    it('claims the question, answers it, completes the exchange, and returns remaining', async () => {
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
      expect(chatRepo.claimQuestion).toHaveBeenCalledWith('m1', CAP, 'What did we decide?');
      expect(chatRepo.completeQuestion).toHaveBeenCalledWith('claim-1', 'We ship chat first [00:00].', {
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
      vi.mocked(chatRepo.claimQuestion).mockResolvedValue({ id: 'claim-2', remaining: 0 });
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

    // A provider timeout has an unknown billing outcome. Releasing the claim would let the
    // customer repeat paid work indefinitely while only one question counts toward the cap.
    it('retains the claim when a provider times out after a request may have been charged', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockRejectedValue(new ChatProviderError());

      const failure = await service.ask('u1', 'm1', 'What did we decide?').catch(err => err);
      expect(failure).toBeInstanceOf(ChatProviderError);
      expect(failure.message).toContain('counted toward the meeting limit');
      expect(chatRepo.completeQuestion).not.toHaveBeenCalled();
      expect(chatRepo.releaseQuestion).not.toHaveBeenCalled();
      expect(chatRepo.markQuestionOutcomeUnknown).toHaveBeenCalledWith('claim-1');
    });

    it('releases the claim when reading history fails before any provider call', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.listByMeeting).mockRejectedValue(new Error('history unavailable'));

      await expect(service.ask('u1', 'm1', 'What did we decide?')).rejects.toThrow('history unavailable');
      expect(chatAdapter.answerQuestion).not.toHaveBeenCalled();
      expect(chatRepo.releaseQuestion).toHaveBeenCalledWith('claim-1');
      expect(chatRepo.markQuestionOutcomeUnknown).not.toHaveBeenCalled();
    });

    it('releases an oversized transcript rejected by the adapter before provider work', async () => {
      const generateContent = vi.fn();
      const client: GeminiClient = { models: { generateContent } };
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue([
        { startMs: 0, endMs: 1000, speaker: 'A', text: 'x'.repeat(config.MAX_TRANSCRIPT_CHARS) },
      ]);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      const realAdapterService = new ChatService(transcriptRepo, chatRepo,
        new GeminiChatAdapter(client), { getAccess: vi.fn().mockResolvedValue({
          plan: 'free', status: 'none', hasPaidAccess: false,
          entitlements: { ...PLAN_ENTITLEMENTS.free, chatQuestionsPerMeeting: CAP },
          subscription: null,
        }) });

      await expect(realAdapterService.ask('u1', 'm1', 'question?')).rejects.toThrow(/transcript too large/i);
      expect(generateContent).not.toHaveBeenCalled();
      expect(chatRepo.releaseQuestion).toHaveBeenCalledWith('claim-1');
      expect(chatRepo.markQuestionOutcomeUnknown).not.toHaveBeenCalled();
    });

    it('reads history after claiming and before publishing the new question', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.countUserMessages).mockResolvedValue(0);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockResolvedValue({ answer: 'x', inputTokens: 0, outputTokens: 0 });

      await service.ask('u1', 'm1', 'q');

      const listOrder = vi.mocked(chatRepo.listByMeeting).mock.invocationCallOrder[0];
      const claimOrder = vi.mocked(chatRepo.claimQuestion).mock.invocationCallOrder[0];
      const completeOrder = vi.mocked(chatRepo.completeQuestion).mock.invocationCallOrder[0];
      expect(claimOrder).toBeLessThan(listOrder);
      expect(listOrder).toBeLessThan(completeOrder);
    });

    it('keeps the claim if answer persistence fails after the paid model call', async () => {
      vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
      vi.mocked(chatRepo.listByMeeting).mockResolvedValue([]);
      vi.mocked(chatAdapter.answerQuestion).mockResolvedValue({ answer: 'answer', inputTokens: 1, outputTokens: 1 });
      vi.mocked(chatRepo.completeQuestion).mockRejectedValue(new Error('database response lost'));

      await expect(service.ask('u1', 'm1', 'question?')).rejects.toThrow('database response lost');
      expect(chatRepo.releaseQuestion).not.toHaveBeenCalled();
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
      vi.mocked(chatRepo.claimQuestion).mockResolvedValue({ id: 'claim-3', remaining: 0 });
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
