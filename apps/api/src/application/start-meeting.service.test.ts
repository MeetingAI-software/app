import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingRepository } from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { Meeting, MeetingStatus } from '../domain/types';
import { BotProviderError, CapExceededError } from '../domain/errors';
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
  const assertCanStartMeeting = vi.fn();
  const create = vi.fn();
  const updateStatus = vi.fn();
  const createBot = vi.fn();

  let service: StartMeetingService;

  beforeEach(() => {
    assertCanStartMeeting.mockReset();
    assertCanStartMeeting.mockResolvedValue(ENTITLEMENTS);
    create.mockReset();
    create.mockResolvedValue(meeting());
    updateStatus.mockReset();
    updateStatus.mockImplementation(async (id: string, status: MeetingStatus, extra?: Partial<Meeting>) =>
      meeting({ id, status, ...extra }));
    createBot.mockReset();
    createBot.mockResolvedValue({ botId: 'bot-42' });

    service = new StartMeetingService(
      { create, updateStatus } as unknown as MeetingRepository,
      { assertCanStartMeeting } as unknown as UsageMeterService,
      { createBot } as unknown as MeetingBotPort,
    );
  });

  describe('the happy path', () => {
    it('creates the meeting owned by the caller and sends the bot in', async () => {
      const result = await service.start('u1', 'https://us02web.zoom.us/j/123');

      expect(create).toHaveBeenCalledWith({
        ownerUserId: 'u1',
        source: 'bot',
        meetingUrl: 'https://us02web.zoom.us/j/123',
        platform: 'zoom',
      });
      expect(createBot).toHaveBeenCalledWith({
        meetingUrl: 'https://us02web.zoom.us/j/123',
        meetingId: 'm1',
        maxMeetingSeconds: 3600,
      });
      expect(updateStatus).toHaveBeenCalledWith('m1', 'bot_joining', { botId: 'bot-42' });
      expect(result.status).toBe('bot_joining');
      expect(result.botId).toBe('bot-42');
    });

    // The bot is told when to leave, and the answer comes from the caller's plan. Lose this and a
    // free-plan bot sits in a call all afternoon on our transcription bill.
    it('passes the plan’s meeting length limit to the provider', async () => {
      assertCanStartMeeting.mockResolvedValue({ maxMeetingSeconds: 900 });

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

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ platform }));
    });
  });

  describe('the quota gate', () => {
    // Quota is asserted before anything is created, so a user over their limit leaves no orphan row
    // behind and — more to the point — never reaches the provider, who charges by the bot.
    it('refuses before creating a meeting or calling the provider', async () => {
      const capped = new CapExceededError('concurrent bot limit');
      assertCanStartMeeting.mockRejectedValue(capped);

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123')).rejects.toThrow(capped);

      expect(create).not.toHaveBeenCalled();
      expect(createBot).not.toHaveBeenCalled();
      expect(updateStatus).not.toHaveBeenCalled();
    });

    it('checks the quota against the caller, not the meeting', async () => {
      await service.start('u1', 'https://us02web.zoom.us/j/123');

      expect(assertCanStartMeeting).toHaveBeenCalledWith('u1');
    });

    // The domain error is re-thrown as itself so the route can map it to 429. Wrapping it in a
    // BotProviderError here would surface "the bot provider failed" to a user whose real problem is
    // that they have used up their plan.
    it('lets the quota error through unchanged rather than blaming the provider', async () => {
      assertCanStartMeeting.mockRejectedValue(new CapExceededError('monthly minutes used up'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(CapExceededError);
    });
  });

  describe('when the bot provider refuses', () => {
    // THE test for this file.
    it('closes the meeting out as failed and reports a provider error', async () => {
      createBot.mockRejectedValue(new Error('Recall rejected the link'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(BotProviderError);

      expect(updateStatus).toHaveBeenCalledWith('m1', 'failed', {
        errorMessage: 'Recall rejected the link',
      });
    });

    it('keeps the provider’s own words in the error, for the console and for Sentry', async () => {
      createBot.mockRejectedValue(new Error('meeting has already ended'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toThrow('meeting has already ended');
    });

    // A provider can reject with something that has no `.message` at all. The meeting must still be
    // closed out — a thrown TypeError in the catch block would leave the row pending forever.
    it('still fails the meeting when the provider throws something shapeless', async () => {
      createBot.mockRejectedValue({ status: 502 });

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
        .rejects.toBeInstanceOf(BotProviderError);

      expect(updateStatus).toHaveBeenCalledWith('m1', 'failed', {
        errorMessage: 'Failed to create bot',
      });
    });

    it('never leaves the meeting in the state the user would see as "still starting"', async () => {
      createBot.mockRejectedValue(new Error('nope'));

      await expect(service.start('u1', 'https://us02web.zoom.us/j/123')).rejects.toThrow();

      const statuses = updateStatus.mock.calls.map(([, status]) => status);
      expect(statuses).toEqual(['failed']);
      expect(statuses).not.toContain('bot_joining');
    });
  });

  // The status change goes through the state machine rather than being written blind, so an
  // impossible jump is caught here instead of leaving the row in a state the worker cannot handle.
  it('refuses to move a meeting that is not pending into bot_joining', async () => {
    create.mockResolvedValue(meeting({ status: 'transcribed' as MeetingStatus }));

    await expect(service.start('u1', 'https://us02web.zoom.us/j/123'))
      .rejects.toBeInstanceOf(BotProviderError);

    // The guard fires inside the try, so the same catch closes the meeting out.
    expect(updateStatus).toHaveBeenCalledWith('m1', 'failed', expect.objectContaining({
      errorMessage: expect.stringContaining('Invalid transition'),
    }));
  });
});
