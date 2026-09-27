import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingRepository } from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { Meeting, MeetingStatus } from '../domain/types';
import { BotProviderError, CapExceededError, BOT_PROVIDER_MESSAGE } from '../domain/errors';
import { StartMeetingService } from './start-meeting.service';
import type { UsageMeterService } from './usage-meter.service';

// ---------------------------------------------------------------------------
// What runs when somebody pastes a meeting link. Three collaborators in a fixed
// order — quota, then the meeting row, then the bot — and one failure path that
// matters more than the happy one: if the provider refuses, the row that was
// already created has to be closed out as `failed`. Leave it `pending` and the
// console shows a spinner that never resolves and never explains itself.
// ---------------------------------------------------------------------------

const ENTITLEMENTS = { maxMeetingSeconds: 3600 };

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: 'https://us02web.zoom.us/j/1',
    platform: 'zoom',
    status: 'pending' as MeetingStatus,
    source: 'bot',
    botId: null,
    ownerUserId: 'u1',
    durationSeconds: null,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    shareEnabled: true,
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-01T09:00:00Z'),
    ...overrides,
  };
}

describe('StartMeetingService', () => {
  const reserveMeeting = vi.fn();
  const create = vi.fn();
  const updateStatus = vi.fn();
  const markBotCreationRejected = vi.fn();
  const bindCreatedBot = vi.fn();
  const createBot = vi.fn();

  let service: StartMeetingService;

  beforeEach(() => {
    reserveMeeting.mockReset();
    reserveMeeting.mockResolvedValue({ meeting: meeting(), entitlements: ENTITLEMENTS });
    create.mockReset();
    create.mockResolvedValue(meeting());
    updateStatus.mockReset();
    updateStatus.mockImplementation(async (id: string, status: MeetingStatus, extra?: Partial<Meeting>) =>
      meeting({ id, status, ...extra }));
    markBotCreationRejected.mockReset();
    markBotCreationRejected.mockImplementation(async (id: string, errorMessage: string) =>
      meeting({ id, status: 'failed', errorMessage, botStartRejectedAt: new Date() }));
    bindCreatedBot.mockReset();
    bindCreatedBot.mockImplementation(async (id: string, botId: string) =>
      meeting({ id, status: 'bot_joining', botId }));
    createBot.mockReset();
    createBot.mockResolvedValue({ botId: 'bot-42' });

    service = new StartMeetingService(
      { create, updateStatus, markBotCreationRejected, bindCreatedBot } as unknown as MeetingRepository,
      { reserveMeeting } as unknown as UsageMeterService,
      { createBot } as unknown as MeetingBotPort,
    );
  });

  describe('the happy path', () => {
    it('creates the meeting owned by the caller and sends the bot in', async () => {
      const result = await service.start('u1', 'https://us02web.zoom.us/j/123');

      expect(reserveMeeting).toHaveBeenCalledWith('u1', 'bot', {
        meetingUrl: 'https://us02web.zoom.us/j/123',
        platform: 'zoom',
      });
      expect(createBot).toHaveBeenCalledWith({
        meetingUrl: 'https://us02web.zoom.us/j/123',
        meetingId: 'm1',
        maxMeetingSeconds: 3600,
      });
      expect(bindCreatedBot).toHaveBeenCalledWith('m1', 'bot-42');
      expect(result.status).toBe('bot_joining');
      expect(result.botId).toBe('bot-42');
    });

    // The bot is told when to leave, and the answer comes from the caller's plan. Lose this and a
    // free-plan bot sits in a call all afternoon on our transcription bill.
    it('passes the plan’s meeting length limit to the provider', async () => {
      reserveMeeting.mockResolvedValue({ meeting: meeting(), entitlements: { maxMeetingSeconds: 900 } });

      await service.start('u1', 'https://us02web.zoom.us/j/123');

      expect(createBot).toHaveBeenCalledWith(expect.objectContaining({ maxMeetingSeconds: 900 }));
    });

    it.each([
      ['Zoom', 'https://us02web.zoom.us/j/123', 'zoom'],
      ['Google Meet', 'https://meet.google.com/abc-defg-hij', 'google_meet'],
      ['Microsoft Teams', 'https://teams.microsoft.com/l/meetup-join/xyz', 'teams'],
      ['Teams Live', 'https://teams.live.com/meet/123', 'teams'],
    ])('records a %s link under its own platform', async (_label, url, platform) => {
      await service.start('u1', url);

      expect(reserveMeeting).toHaveBeenCalledWith('u1', 'bot', expect.objectContaining({ platform }));
    });
  });

  describe('the quota gate', () => {
    // Quota is asserted before anything is created, so a user over their limit leaves no orphan row
    // behind and — more to the point — never reaches the provider, who charges by the bot.
    it('refuses before creating a meeting or calling the provider', async () => {
      const capped = new CapExceededError('concurrent bot limit');
      reserveMeeting.mockRejectedValue(capped);

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123')).rejects.toThrow(capped);

      expect(create).not.toHaveBeenCalled();
      expect(createBot).not.toHaveBeenCalled();
      expect(updateStatus).not.toHaveBeenCalled();
    });

    it('checks the quota against the caller, not the meeting', async () => {
      await service.start('u1', 'https://us02web.zoom.us/j/123');

      expect(reserveMeeting).toHaveBeenCalledWith('u1', 'bot', expect.any(Object));
    });

    // The domain error is re-thrown as itself so the route can map it to 429. Wrapping it in a
    // BotProviderError here would surface "the bot provider failed" to a user whose real problem is
    // that they have used up their plan.
    it('lets the quota error through unchanged rather than blaming the provider', async () => {
      reserveMeeting.mockRejectedValue(new CapExceededError('monthly minutes used up'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(CapExceededError);
    });
  });

  describe('when the bot provider refuses', () => {
    // THE test for this file.
    it('preserves the claim when an unclassified provider error may hide a created bot', async () => {
      createBot.mockRejectedValue(new Error('Recall rejected the link'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(BotProviderError);

      expect(updateStatus).not.toHaveBeenCalled();
      expect(markBotCreationRejected).not.toHaveBeenCalled();
    });

    it('discards provider words before persistence and monitoring', async () => {
      createBot.mockRejectedValue(new Error('meeting has already ended'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toThrow(BOT_PROVIDER_MESSAGE);
      expect(JSON.stringify(updateStatus.mock.calls)).not.toContain('meeting has already ended');
      expect(JSON.stringify(markBotCreationRejected.mock.calls)).not.toContain('meeting has already ended');
    });

    // A provider can reject with something that has no `.message` at all. The meeting must still be
    // closed out — a thrown TypeError in the catch block would leave the row pending forever.
    it('keeps the claim when the provider throws something shapeless', async () => {
      createBot.mockRejectedValue({ status: 502 });

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(BotProviderError);

      expect(updateStatus).not.toHaveBeenCalled();
      expect(markBotCreationRejected).not.toHaveBeenCalled();
    });

    it('keeps the uncertain claim for reconciliation after an unclassified failure', async () => {
      createBot.mockRejectedValue(new Error('nope'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123')).rejects.toThrow();

      const statuses = updateStatus.mock.calls.map(([, status]) => status);
      expect(statuses).toEqual([]);
      expect(markBotCreationRejected).not.toHaveBeenCalled();
    });

    it('keeps the pending claim when an ambiguous provider response may hide a paid bot', async () => {
      createBot.mockRejectedValue(new BotProviderError({ operation: 'create_bot', status: 503 }));
      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(BotProviderError);
      expect(updateStatus).not.toHaveBeenCalled();
    });

    it('releases a definite provider rejection before any bot was created', async () => {
      createBot.mockRejectedValue(new BotProviderError({ operation: 'create_bot', status: 400 }));
      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(BotProviderError);
      expect(markBotCreationRejected).toHaveBeenCalledWith('m1', BOT_PROVIDER_MESSAGE);
      expect(updateStatus).not.toHaveBeenCalled();
    });
  });

  // The status change goes through the state machine rather than being written blind, so an
  // impossible jump is caught here instead of leaving the row in a state the worker cannot handle.
  it('refuses to move a meeting that is not pending into bot_joining', async () => {
    reserveMeeting.mockResolvedValue({ meeting: meeting({ status: 'transcribed' as MeetingStatus }), entitlements: ENTITLEMENTS });
    bindCreatedBot.mockRejectedValueOnce(new Error('Bot creation claim already has a different outcome'));

    await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
      .rejects.toBeInstanceOf(BotProviderError);

    // A bot ID has been issued; do not release its durable claim on a later local failure.
    expect(updateStatus).not.toHaveBeenCalled();
    expect(bindCreatedBot).toHaveBeenCalledWith('m1', 'bot-42');
  });

  it('keeps the claim if the bot was created but its ID could not be persisted', async () => {
    bindCreatedBot.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
      .rejects.toBeInstanceOf(BotProviderError);
    expect(createBot).toHaveBeenCalledTimes(1);
    expect(bindCreatedBot).toHaveBeenCalledTimes(1);
    expect(bindCreatedBot).toHaveBeenCalledWith('m1', 'bot-42');
  });
});
