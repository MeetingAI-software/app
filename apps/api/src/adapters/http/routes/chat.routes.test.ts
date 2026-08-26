import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import type { MeetingRepository } from '../../../ports/repositories.port';
import type { ChatService } from '../../../application/chat.service';
import type { Meeting, MeetingStatus, User } from '../../../domain/types';
import { CapExceededError, ChatProviderError, MeetingNotReadyError } from '../../../domain/errors';
import { createServer } from '../server';
import { createChatRoutes } from './chat.routes';

// ---------------------------------------------------------------------------
// Both chat endpoints sit behind one ownership gate (chat.routes.ts:18). It has
// to run before anything else, because everything after it either reads a
// transcript or spends money on the model.
//
// Every test acts as its own user id — the per-user limiter is a closure
// created inside createChatRoutes with no reset hook, so isolation comes from
// varying the key rather than from clearing the bucket.
// ---------------------------------------------------------------------------

/** Each user owns exactly one meeting, `m-<their id>`. Any other id belongs to somebody else. */
function ownMeetingOf(userId: string): string {
  return `m-${userId}`;
}

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: 'https://us02web.zoom.us/j/1',
    platform: 'zoom',
    status: 'transcribed' as MeetingStatus,
    source: 'bot',
    botId: 'bot-1',
    ownerUserId: 'u1',
    durationSeconds: 1800,
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

describe('chat routes', () => {
  const ask = vi.fn();
  const getHistory = vi.fn();
  let server: Server;
  let baseUrl: string;

  const meetingRepo = {
    findByIdForUser: vi.fn(async (id: string, userId: string) =>
      (id === ownMeetingOf(userId) ? meeting({ id, ownerUserId: userId }) : null)),
  } as unknown as MeetingRepository;

  beforeAll(() => {
    const chatService = { ask, getHistory } as unknown as ChatService;

    // The session token IS the user id, so each test can pick a fresh one.
    const app = createServer(
      [createChatRoutes(meetingRepo, chatService)],
      async (token): Promise<User | null> => (token
        ? { id: token, email: `${token}@example.com`, emailVerified: true, createdAt: new Date() }
        : null),
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    ask.mockReset();
    ask.mockResolvedValue({ answer: 'We signed off the budget.', remaining: 9 });
    getHistory.mockReset();
    getHistory.mockResolvedValue({
      messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }],
      remaining: 8,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  function asUser(userId: string) {
    const cookie = `session=${userId}`;
    return {
      askOn: (meetingId: string, body: unknown = { question: 'What did we decide?' }) =>
        fetch(`${baseUrl}/api/meetings/${meetingId}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN, cookie },
          body: JSON.stringify(body),
        }),
      historyOn: (meetingId: string) =>
        fetch(`${baseUrl}/api/meetings/${meetingId}/chat`, { headers: { cookie } }),
    };
  }

  describe('the ownership gate', () => {
    // THE test for this file. A stranger's meeting must be indistinguishable from one that does not
    // exist, and — just as important — the service must never be reached: `ask` reads the whole
    // transcript into a model prompt and bills for it.
    it('refuses to answer a question about somebody else’s meeting, without asking the model', async () => {
      const response = await asUser('intruder-1').askOn(ownMeetingOf('victim'));
      const body = await response.json() as { error: { code: string; message: string } };

      expect(response.status).toBe(404);
      expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Meeting not found' });
      expect(ask).not.toHaveBeenCalled();
    });

    it('refuses to hand over somebody else’s chat history', async () => {
      const response = await asUser('intruder-2').historyOn(ownMeetingOf('victim'));

      expect(response.status).toBe(404);
      expect(getHistory).not.toHaveBeenCalled();
    });

    it('answers 404 for a meeting that does not exist at all', async () => {
      expect((await asUser('user-a').askOn('no-such-meeting')).status).toBe(404);
      expect((await asUser('user-a').historyOn('no-such-meeting')).status).toBe(404);
      expect(ask).not.toHaveBeenCalled();
      expect(getHistory).not.toHaveBeenCalled();
    });

    // Ownership is settled before the body is validated, so a malformed question against a meeting
    // you do not own still answers 404. The alternative leaks existence: 400 would tell a prober
    // "this meeting is real, your question was just wrong".
    it('does not let a bad question reveal that somebody else’s meeting exists', async () => {
      const response = await asUser('intruder-3').askOn(ownMeetingOf('victim'), { question: '' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/meetings/:id/chat', () => {
    it('answers a question about your own meeting', async () => {
      const user = 'owner-1';
      const response = await asUser(user).askOn(ownMeetingOf(user), { question: 'What did we decide?' });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ answer: 'We signed off the budget.', remaining: 9 });
      expect(ask).toHaveBeenCalledWith(user, ownMeetingOf(user), 'What did we decide?');
    });

    it.each([
      ['an empty question', { question: '' }],
      ['a question of only whitespace', { question: '   ' }],
      ['no question field at all', {}],
      ['a question that is not a string', { question: 42 }],
    ])('rejects %s with a validation error and never calls the model', async (_label, body) => {
      const user = `validator-${Math.random().toString(36).slice(2, 8)}`;
      const response = await asUser(user).askOn(ownMeetingOf(user), body);
      const parsed = await response.json() as { error: { code: string } };

      expect(response.status).toBe(400);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
      expect(ask).not.toHaveBeenCalled();
    });

    // The cap is 500 characters. Both sides of it are pinned so the boundary cannot drift by one in
    // either direction — a rejected 500 is a user staring at an error they cannot explain.
    it('accepts a question of exactly 500 characters and rejects 501', async () => {
      const user = 'boundary-user';
      const atLimit = await asUser(user).askOn(ownMeetingOf(user), { question: 'a'.repeat(500) });
      const overLimit = await asUser(user).askOn(ownMeetingOf(user), { question: 'a'.repeat(501) });

      expect(atLimit.status).toBe(200);
      expect(overLimit.status).toBe(400);
    });

    // Domain failures raised inside the service have to survive the trip through the error handler
    // as their own status, not collapse into a generic 500 the UI cannot act on.
    it.each([
      [new CapExceededError('No questions left for this meeting'), 429, 'CAP_EXCEEDED'],
      [new MeetingNotReadyError('Meeting is not transcribed yet'), 409, 'MEETING_NOT_READY'],
      [new ChatProviderError(), 502, 'CHAT_PROVIDER_ERROR'],
    ])('maps %s to HTTP %i', async (error, expectedStatus, expectedCode) => {
      ask.mockRejectedValueOnce(error);
      const user = `mapper-${expectedStatus}`;

      const response = await asUser(user).askOn(ownMeetingOf(user));
      const body = await response.json() as { error: { code: string; message: string } };

      expect(response.status).toBe(expectedStatus);
      expect(body.error.code).toBe(expectedCode);
      expect(body.error.message).toBe(error.message);
    });

    // Each question re-reads the whole meeting, so the ceiling is a spend limit as much as an abuse
    // limit. 10 a minute; the eleventh waits.
    it('stops the eleventh question in a minute', async () => {
      const user = 'chatty-user';
      const target = ownMeetingOf(user);

      for (let i = 0; i < 10; i++) {
        expect((await asUser(user).askOn(target)).status).toBe(200);
      }
      const eleventh = await asUser(user).askOn(target);
      const body = await eleventh.json() as { error: { code: string } };

      expect(eleventh.status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(eleventh.headers.get('retry-after')).not.toBeNull();
    });
  });

  describe('GET /api/meetings/:id/chat', () => {
    it('returns the conversation and how many questions are left', async () => {
      const user = 'reader-1';
      const response = await asUser(user).historyOn(ownMeetingOf(user));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }],
        remaining: 8,
      });
      expect(getHistory).toHaveBeenCalledWith(user, ownMeetingOf(user));
    });

    // Reading history is free, so it is deliberately not behind the question limiter. Pinned so it
    // is not "tidied" onto the same limiter later and starts blocking people who are only reading.
    it('is not rationed the way asking is', async () => {
      const user = 'avid-reader';
      const target = ownMeetingOf(user);

      for (let i = 0; i < 15; i++) {
        expect((await asUser(user).historyOn(target)).status).toBe(200);
      }
    });
  });

  describe('without a session', () => {
    it('refuses both endpoints', async () => {
      const anon = { headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN } };

      const asked = await fetch(`${baseUrl}/api/meetings/m-x/chat`, {
        ...anon, method: 'POST', body: JSON.stringify({ question: 'hello' }),
      });
      const read = await fetch(`${baseUrl}/api/meetings/m-x/chat`);

      expect(asked.status).toBe(401);
      expect(read.status).toBe(401);
      expect(ask).not.toHaveBeenCalled();
      expect(getHistory).not.toHaveBeenCalled();
    });
  });
});
