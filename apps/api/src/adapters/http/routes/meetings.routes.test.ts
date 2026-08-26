import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../config/env';
import type {
  DocumentRepository,
  LiveTranscriptRepository,
  MeetingRepository,
  TranscriptRepository,
} from '../../../ports/repositories.port';
import type { StartMeetingService } from '../../../application/start-meeting.service';
import type { DocumentGeneratorPort } from '../../../ports/document-generator.port';
import type { DocumentContent } from '../../../domain/document';
import type { Meeting, MeetingStatus, TranscriptSegment, User } from '../../../domain/types';
import { BotProviderError, CapExceededError } from '../../../domain/errors';
import { createServer } from '../server';
import { createMeetingRoutes } from './meetings.routes';

// ---------------------------------------------------------------------------
// The console's endpoints. Every owner-scoped one asks the same question —
// findByIdForUser(id, req.userId) — and answers 404 when it isn't yours. That
// answer is the app's only tenancy boundary at the HTTP layer.
//
// /live and /live/stream are covered by live-transcript.routes.test.ts and are
// deliberately not repeated here; this file passes no live repo or bus, so
// those two routes are out of play.
//
// Each test acts as its own user id. The document limiter is 3/minute and its
// bucket is a closure with no reset hook, so isolation comes from varying the
// key rather than from clearing the bucket.
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
    summary: 'A short recap.',
    shareToken: 'share-tok',
    shareEnabled: true,
    participantNames: ['Alper Eken'],
    audioStoragePath: 'recordings/secret.m4a',
    transcriptionJobId: 'job-1',
    createdAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-01T09:30:00Z'),
    ...overrides,
  };
}

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 4200, speaker: 'Alper Eken', text: 'Shall we start?' },
  { startMs: 4200, endMs: 9100, speaker: 'Speaker 2', text: 'Yes — budget first.' },
];

function docContent(overrides: Partial<DocumentContent> = {}): DocumentContent {
  return {
    title: 'Q3 Budget Planning',
    missed5: ['Budget was signed off', 'Hiring is paused', 'Launch moved to September'],
    decisions: ['Ship without the export feature'],
    actionPoints: [{ task: 'Draft the revised budget', owner: 'Alper Eken', deadlineIso: '2026-07-18' }],
    openQuestions: ['Who owns the migration?'],
    ...overrides,
  };
}

describe('meeting routes', () => {
  const start = vi.fn();
  const listForUser = vi.fn();
  const findByShareToken = vi.fn();
  const list = vi.fn();
  const getTranscript = vi.fn();
  const getDocument = vi.fn();
  const upsertForMeeting = vi.fn();
  const generateDocument = vi.fn();

  let server: Server;
  let baseUrl: string;
  /** Overridden per-test when a case needs a status other than `transcribed`. */
  let meetingOverrides: Partial<Meeting> = {};

  const setShareEnabled = vi.fn();
  const rotateShareToken = vi.fn();

  const meetingRepo = {
    findByIdForUser: vi.fn(async (id: string, userId: string) =>
      (id === ownMeetingOf(userId) ? meeting({ id, ownerUserId: userId, ...meetingOverrides }) : null)),
    listForUser,
    findByShareToken,
    list,
    setShareEnabled,
    rotateShareToken,
  } as unknown as MeetingRepository;

  const transcriptRepo = { getByMeetingId: getTranscript } as unknown as TranscriptRepository;
  const documentRepo = {
    getByMeetingId: getDocument,
    upsertForMeeting,
  } as unknown as DocumentRepository;

  beforeAll(() => {
    const app = createServer(
      [createMeetingRoutes(
        meetingRepo,
        transcriptRepo,
        documentRepo,
        { start } as unknown as StartMeetingService,
        { generateDocument } as unknown as DocumentGeneratorPort,
        undefined as unknown as LiveTranscriptRepository,
        undefined,
      )],
      // The session token IS the user id, so each test can pick a fresh one.
      async (token): Promise<User | null> => (token
        ? { id: token, email: `${token}@example.com`, emailVerified: true, createdAt: new Date() }
        : null),
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    meetingOverrides = {};
    for (const fn of [start, listForUser, findByShareToken, list, getTranscript, getDocument, upsertForMeeting, generateDocument]) {
      fn.mockReset();
    }
    listForUser.mockResolvedValue([]);
    findByShareToken.mockResolvedValue(null);
    getTranscript.mockResolvedValue(SEGMENTS);
    getDocument.mockResolvedValue(null);
    upsertForMeeting.mockResolvedValue({ id: 'doc-1' });
    generateDocument.mockResolvedValue({
      content: docContent(), model: 'gemini-2.5-flash', inputTokens: 1200, outputTokens: 340,
    });
    start.mockResolvedValue(meeting({ id: 'created-1', status: 'bot_joining' }));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  function asUser(userId: string) {
    const cookie = `session=${userId}`;
    return {
      get: (path: string) => fetch(`${baseUrl}${path}`, { headers: { cookie } }),
      post: (path: string, body: unknown = {}) => fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN, cookie },
        body: JSON.stringify(body),
      }),
    };
  }

  // -------------------------------------------------------------------------
  // The tenancy boundary — the reason this file exists.
  // -------------------------------------------------------------------------
  describe('ownership', () => {
    it.each([
      ['GET', (id: string) => `/api/meetings/${id}`],
      ['GET', (id: string) => `/api/meetings/${id}/transcript`],
      ['GET', (id: string) => `/api/meetings/${id}/document`],
      ['POST', (id: string) => `/api/meetings/${id}/document`],
      ['POST', (id: string) => `/api/meetings/${id}/share/enable`],
      ['POST', (id: string) => `/api/meetings/${id}/share/disable`],
      ['POST', (id: string) => `/api/meetings/${id}/share/rotate`],
    ])('answers 404 to %s %s for a meeting owned by somebody else', async (method, path) => {
      const intruder = `intruder-${method}-${Math.random().toString(36).slice(2, 8)}`;
      const target = path(ownMeetingOf('victim'));

      const response = method === 'GET'
        ? await asUser(intruder).get(target)
        : await asUser(intruder).post(target);
      const body = await response.json() as { error: { code: string; message: string } };

      expect(response.status).toBe(404);
      expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Meeting not found' });
    });

    // The 404 has to be decided before anything downstream runs, or a stranger's transcript is
    // still read off disk and their summary still costs money to generate.
    it('reads nothing and generates nothing on a refused request', async () => {
      const target = ownMeetingOf('victim');

      await asUser('intruder-a').get(`/api/meetings/${target}/transcript`);
      await asUser('intruder-b').get(`/api/meetings/${target}/document`);
      await asUser('intruder-c').post(`/api/meetings/${target}/document`);

      expect(getTranscript).not.toHaveBeenCalled();
      expect(getDocument).not.toHaveBeenCalled();
      expect(generateDocument).not.toHaveBeenCalled();
      expect(upsertForMeeting).not.toHaveBeenCalled();
    });

    // A stranger must not be able to pull the rug out from under someone else's share link.
    it('does not touch share state on a refused request', async () => {
      const target = ownMeetingOf('victim');

      await asUser('intruder-d').post(`/api/meetings/${target}/share/disable`);
      await asUser('intruder-e').post(`/api/meetings/${target}/share/rotate`);

      expect(setShareEnabled).not.toHaveBeenCalled();
      expect(rotateShareToken).not.toHaveBeenCalled();
    });

    it('answers 404 for a meeting that does not exist at all', async () => {
      expect((await asUser('user-x').get('/api/meetings/no-such-thing')).status).toBe(404);
    });
  });

  describe('GET /api/meetings', () => {
    // The unscoped `list()` exists for the reconciler. If it were ever wired in here, one request
    // would hand back every meeting in the database.
    it('lists only the caller’s own meetings', async () => {
      const mine = [meeting({ id: 'm-owner-1', ownerUserId: 'owner-1' })];
      listForUser.mockResolvedValue(mine);

      const response = await asUser('owner-1').get('/api/meetings');

      expect(response.status).toBe(200);
      expect(listForUser).toHaveBeenCalledWith('owner-1');
      expect(list).not.toHaveBeenCalled();
      expect((await response.json() as Meeting[])).toHaveLength(1);
    });
  });

  describe('POST /api/meetings', () => {
    it.each([
      ['Zoom', 'https://us02web.zoom.us/j/123456789'],
      ['Google Meet', 'https://meet.google.com/abc-defg-hij'],
      ['Microsoft Teams', 'https://teams.microsoft.com/l/meetup-join/xyz'],
    ])('starts a %s meeting', async (_label, meetingUrl) => {
      const user = `starter-${_label}`;
      const response = await asUser(user).post('/api/meetings', { meetingUrl });

      expect(response.status).toBe(201);
      expect(start).toHaveBeenCalledWith(user, meetingUrl);
    });

    it.each([
      ['a string that is not a URL', 'not-a-url'],
      ['an unsupported host', 'https://example.com/whatever'],
      ['a bare word', 'zoom'],
      ['a missing field', undefined],
    ])('rejects %s without asking the bot provider to join', async (_label, meetingUrl) => {
      const user = `rejector-${Math.random().toString(36).slice(2, 8)}`;
      const response = await asUser(user).post('/api/meetings', meetingUrl === undefined ? {} : { meetingUrl });
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(start).not.toHaveBeenCalled();
    });

    it.each([
      [new BotProviderError('Recall refused the link'), 502, 'BOT_PROVIDER_ERROR'],
      [new CapExceededError('Monthly minutes used up'), 429, 'CAP_EXCEEDED'],
    ])('maps %s to HTTP %i', async (error, expectedStatus, expectedCode) => {
      start.mockRejectedValueOnce(error);

      const response = await asUser(`mapper-${expectedStatus}`)
        .post('/api/meetings', { meetingUrl: 'https://us02web.zoom.us/j/1' });
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(expectedStatus);
      expect(body.error.code).toBe(expectedCode);
    });
  });

  describe('GET /api/meetings/:id', () => {
    it('returns the meeting when it is yours', async () => {
      const user = 'viewer-1';
      const response = await asUser(user).get(`/api/meetings/${ownMeetingOf(user)}`);

      expect(response.status).toBe(200);
      expect((await response.json() as Meeting).id).toBe(ownMeetingOf(user));
    });
  });

  describe('GET /api/meetings/:id/transcript', () => {
    it('returns the segments', async () => {
      const user = 'reader-1';
      const response = await asUser(user).get(`/api/meetings/${ownMeetingOf(user)}/transcript`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(SEGMENTS);
    });

    // Two 404s that mean different things. "Your meeting exists but has no transcript yet" is a
    // spinner; "no such meeting" is an error page. Collapsing them would make the console lie.
    it('distinguishes a missing transcript from a missing meeting', async () => {
      const user = 'reader-2';
      getTranscript.mockResolvedValue(null);

      const response = await asUser(user).get(`/api/meetings/${ownMeetingOf(user)}/transcript`);
      const body = await response.json() as { error: { message: string } };

      expect(response.status).toBe(404);
      expect(body.error.message).toBe('Transcript not found');
    });
  });

  describe('GET /api/meetings/:id/document', () => {
    it('returns the stored document', async () => {
      const user = 'doc-reader';
      const stored = { content: docContent(), createdAt: new Date('2026-08-01T10:00:00Z') };
      getDocument.mockResolvedValue(stored);

      const response = await asUser(user).get(`/api/meetings/${ownMeetingOf(user)}/document`);

      expect(response.status).toBe(200);
      expect((await response.json() as { content: DocumentContent }).content.title).toBe('Q3 Budget Planning');
    });

    it('distinguishes a missing document from a missing meeting', async () => {
      const user = 'doc-reader-2';
      getDocument.mockResolvedValue(null);

      const response = await asUser(user).get(`/api/meetings/${ownMeetingOf(user)}/document`);
      const body = await response.json() as { error: { message: string } };

      expect(response.status).toBe(404);
      expect(body.error.message).toBe('Document not found');
    });
  });

  // -------------------------------------------------------------------------
  // Generating a summary is the one endpoint that spends real money per call.
  // -------------------------------------------------------------------------
  describe('POST /api/meetings/:id/document', () => {
    // THE money test. The console requests the summary every time the page opens. If the cached
    // copy stopped being returned, every refresh would bill Gemini again for the same document.
    it('returns the existing document without paying to generate it again', async () => {
      const user = 'cacher-1';
      const stored = { content: docContent({ title: 'Already written' }), createdAt: new Date() };
      getDocument.mockResolvedValue(stored);

      const response = await asUser(user).post(`/api/meetings/${ownMeetingOf(user)}/document`);
      const body = await response.json() as { document: { content: DocumentContent } };

      expect(response.status).toBe(200);
      expect(body.document.content.title).toBe('Already written');
      expect(generateDocument).not.toHaveBeenCalled();
      expect(upsertForMeeting).not.toHaveBeenCalled();
    });

    it('regenerates on request, replacing what was there', async () => {
      const user = 'regenerator-1';
      getDocument
        .mockResolvedValueOnce({ content: docContent({ title: 'Old' }), createdAt: new Date() })
        .mockResolvedValueOnce({ content: docContent({ title: 'Fresh' }), createdAt: new Date() });

      const response = await asUser(user)
        .post(`/api/meetings/${ownMeetingOf(user)}/document?regenerate=true`);

      expect(response.status).toBe(201);
      expect(generateDocument).toHaveBeenCalledTimes(1);
      expect(upsertForMeeting).toHaveBeenCalledTimes(1);
    });

    it('generates the first document and stores it with its cost metadata', async () => {
      const user = 'generator-1';
      getDocument
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ content: docContent(), createdAt: new Date() });

      const response = await asUser(user).post(`/api/meetings/${ownMeetingOf(user)}/document`);

      expect(response.status).toBe(201);
      expect(generateDocument).toHaveBeenCalledWith(SEGMENTS, { meetingIsoDate: '2026-08-01' });
      expect(upsertForMeeting).toHaveBeenCalledWith(
        ownMeetingOf(user),
        docContent(),
        { model: 'gemini-2.5-flash', inputTokens: 1200, outputTokens: 340 },
      );
    });

    it('refuses a meeting that has not finished transcribing', async () => {
      const user = 'early-bird';
      meetingOverrides = { status: 'recording' as MeetingStatus };

      const response = await asUser(user).post(`/api/meetings/${ownMeetingOf(user)}/document`);
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(409);
      expect(body.error.code).toBe('MEETING_NOT_READY');
      expect(generateDocument).not.toHaveBeenCalled();
    });

    it.each([
      ['no transcript at all', null],
      ['an empty transcript', []],
    ])('refuses to summarise %s', async (_label, transcript) => {
      const user = `empty-${Math.random().toString(36).slice(2, 8)}`;
      getTranscript.mockResolvedValue(transcript);

      const response = await asUser(user).post(`/api/meetings/${ownMeetingOf(user)}/document`);
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(409);
      expect(body.error.code).toBe('MEETING_NOT_READY');
      expect(generateDocument).not.toHaveBeenCalled();
    });

    it('reports a generator outage as a bad gateway, not a crash', async () => {
      const user = 'unlucky-1';
      generateDocument.mockRejectedValue(new Error('Gemini timed out'));

      const response = await asUser(user).post(`/api/meetings/${ownMeetingOf(user)}/document`);
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(502);
      expect(body.error.code).toBe('DOCUMENT_GENERATION_ERROR');
      expect(upsertForMeeting).not.toHaveBeenCalled();
    });

    // The Zod gate at meetings.routes.ts:248. Models return malformed shapes; nothing malformed may
    // reach the database, because everything downstream trusts the stored document's shape.
    it('never stores a document the model returned in the wrong shape', async () => {
      const user = 'malformed-1';
      generateDocument.mockResolvedValue({
        content: { title: 'x', missed5: [], decisions: 'not-an-array', actionPoints: [], openQuestions: [] },
        model: 'gemini-2.5-flash', inputTokens: 1, outputTokens: 1,
      });

      const response = await asUser(user).post(`/api/meetings/${ownMeetingOf(user)}/document`);
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(upsertForMeeting).not.toHaveBeenCalled();
    });

    it('stops the fourth generation in a minute', async () => {
      const user = 'greedy-1';
      const target = `/api/meetings/${ownMeetingOf(user)}/document`;
      getDocument.mockResolvedValue({ content: docContent(), createdAt: new Date() });

      for (let i = 0; i < 3; i++) {
        expect((await asUser(user).post(target)).status).toBe(200);
      }
      const fourth = await asUser(user).post(target);
      const body = await fourth.json() as { error: { code: string } };

      expect(fourth.status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('share controls', () => {
    it('enable and disable set the flag and echo the current link', async () => {
      setShareEnabled.mockResolvedValue(meeting({ shareEnabled: true }));
      const on = await asUser('sharer-a').post(`/api/meetings/${ownMeetingOf('sharer-a')}/share/enable`);

      expect(on.status).toBe(200);
      expect(await on.json()).toEqual({ shareToken: 'share-tok', shareEnabled: true });
      expect(setShareEnabled).toHaveBeenCalledWith(ownMeetingOf('sharer-a'), true);

      setShareEnabled.mockResolvedValue(meeting({ shareEnabled: false }));
      const off = await asUser('sharer-b').post(`/api/meetings/${ownMeetingOf('sharer-b')}/share/disable`);

      expect(off.status).toBe(200);
      expect(await off.json()).toEqual({ shareToken: 'share-tok', shareEnabled: false });
      expect(setShareEnabled).toHaveBeenLastCalledWith(ownMeetingOf('sharer-b'), false);
    });

    it('rotate returns the replacement token', async () => {
      rotateShareToken.mockResolvedValue(meeting({ shareToken: 'fresh-tok', shareEnabled: true }));

      const response = await asUser('sharer-c').post(`/api/meetings/${ownMeetingOf('sharer-c')}/share/rotate`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ shareToken: 'fresh-tok', shareEnabled: true });
      expect(rotateShareToken).toHaveBeenCalledWith(ownMeetingOf('sharer-c'));
    });
  });

  // -------------------------------------------------------------------------
  // The public share link — the only endpoint a stranger may reach.
  // -------------------------------------------------------------------------
  describe('GET /api/share/:token', () => {
    it('works with no session and no origin, the way a shared link is opened', async () => {
      findByShareToken.mockResolvedValue(meeting());
      getDocument.mockResolvedValue({ content: docContent(), createdAt: new Date() });

      const response = await fetch(`${baseUrl}/api/share/share-tok`);

      expect(response.status).toBe(200);
      expect(findByShareToken).toHaveBeenCalledWith('share-tok');
    });

    it('answers 404 for a token nobody issued', async () => {
      findByShareToken.mockResolvedValue(null);

      const response = await fetch(`${baseUrl}/api/share/made-up-token`);
      const body = await response.json() as { error: { message: string } };

      expect(response.status).toBe(404);
      expect(body.error.message).toBe('Unknown share token');
    });

    // Turning sharing off has to actually close the door, and it must look identical to a token
    // that never existed — otherwise the response tells a stranger they found a real meeting.
    it('answers the same 404 when sharing is switched off', async () => {
      findByShareToken.mockResolvedValue(meeting({ shareEnabled: false }));
      getDocument.mockResolvedValue({ content: docContent(), createdAt: new Date() });

      const response = await fetch(`${baseUrl}/api/share/share-tok`);
      const body = await response.json() as { error: { code: string; message: string } };

      expect(response.status).toBe(404);
      expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Unknown share token' });
    });

    it('reads no transcript or document for a disabled link', async () => {
      findByShareToken.mockResolvedValue(meeting({ shareEnabled: false }));

      await fetch(`${baseUrl}/api/share/share-tok`);

      expect(getTranscript).not.toHaveBeenCalled();
      expect(getDocument).not.toHaveBeenCalled();
    });

    // A share link goes to strangers. The mapper's field list is pinned in share-response.test.ts;
    // this pins that the route actually goes through it, so a later "just return the meeting"
    // shortcut cannot quietly publish the recording path or the owner's id.
    it('publishes nothing beyond the shareable fields', async () => {
      findByShareToken.mockResolvedValue(meeting());
      getDocument.mockResolvedValue(null);

      const response = await fetch(`${baseUrl}/api/share/share-tok`);
      const body = await response.json() as { meeting: Record<string, unknown> };

      expect(Object.keys(body.meeting).sort())
        .toEqual(['createdAt', 'durationSeconds', 'shareToken', 'status', 'summary']);
      expect(JSON.stringify(body)).not.toContain('recordings/secret.m4a');
      expect(JSON.stringify(body)).not.toContain('us02web.zoom.us');
      expect(JSON.stringify(body)).not.toContain('bot-1');
    });

    it('serves an empty transcript rather than null when there is none yet', async () => {
      findByShareToken.mockResolvedValue(meeting());
      getTranscript.mockResolvedValue(null);
      getDocument.mockResolvedValue(null);

      const response = await fetch(`${baseUrl}/api/share/share-tok`);
      const body = await response.json() as { transcript: unknown; document: unknown };

      expect(body.transcript).toEqual([]);
      expect(body.document).toBeNull();
    });
  });
});
