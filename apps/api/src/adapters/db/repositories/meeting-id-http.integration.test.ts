import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DestinationStream } from 'pino';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { users } from '../schema';
import { DrizzleMeetingRepository } from './meeting.repository';
import { createServer } from '../../http/server';
import { createMeetingRoutes } from '../../http/routes/meetings.routes';
import { createChatRoutes } from '../../http/routes/chat.routes';
import { config } from '../../../config/env';
import type { User } from '../../../domain/types';
import type { TranscriptRepository, DocumentRepository } from '../../../ports/repositories.port';
import type { StartMeetingService } from '../../../application/start-meeting.service';
import type { DocumentGeneratorPort } from '../../../ports/document-generator.port';
import type { ChatService } from '../../../application/chat.service';

// Exercise the HTTP handlers against the real repository and Postgres UUID column. A repository
// double returning null for every unknown ID would also return null for malformed IDs and hide
// the 22P02 database error that originally made this route a 500/Sentry amplifier.
vi.mock('../client', () => ({ db }));

const MISSING_ID = '00000000-0000-0000-0000-000000000000';
const MALFORMED_IDS = ['not-a-uuid', '00000000-0000-0000-0000-00000000000x', 'bad%00id'];

describe('meeting ID HTTP boundary with PostgreSQL', () => {
  const meetingRepo = new DrizzleMeetingRepository();
  const transcript = { getByMeetingId: vi.fn() };
  const document = { getByMeetingId: vi.fn(), claimGeneration: vi.fn() };
  const chat = { ask: vi.fn(), getHistory: vi.fn() };
  let server: Server;
  let baseUrl: string;
  let owner: User;

  beforeAll(async () => {
    await migrateOnce();
    const app = createServer([
      createMeetingRoutes(
        meetingRepo,
        transcript as unknown as TranscriptRepository,
        document as unknown as DocumentRepository,
        {} as StartMeetingService,
        {} as DocumentGeneratorPort,
      ),
      createChatRoutes(meetingRepo, chat as unknown as ChatService),
    ], async token => token === 'owner' ? owner : null, {
      requestLogStream: { write: () => true } as DestinationStream,
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await truncateAll();
    const [row] = await db.insert(users).values({
      email: 'owner@example.com', passwordHash: 'hash', emailVerified: true,
    }).returning();
    owner = { id: row.id, email: row.email, emailVerified: true, createdAt: row.createdAt };
    transcript.getByMeetingId.mockClear();
    document.getByMeetingId.mockClear();
    document.claimGeneration.mockClear();
    chat.ask.mockClear();
    chat.getHistory.mockClear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  async function request(method: 'GET' | 'POST' | 'DELETE', path: string) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { cookie: 'session=owner', ...(method === 'GET' ? {} : { origin: config.WEB_ORIGIN, 'content-type': 'application/json' }) },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
  }

  it.each([
    ['GET', '/api/meetings/:id'],
    ['GET', '/api/meetings/:id/transcript'],
    ['GET', '/api/meetings/:id/document'],
    ['GET', '/api/meetings/:id/live'],
    ['GET', '/api/meetings/:id/live/stream'],
    ['POST', '/api/meetings/:id/document'],
    ['POST', '/api/meetings/:id/share'],
    ['DELETE', '/api/meetings/:id/share'],
    ['POST', '/api/meetings/:id/share/enable'],
    ['POST', '/api/meetings/:id/share/disable'],
    ['POST', '/api/meetings/:id/share/rotate'],
    ['GET', '/api/meetings/:id/chat'],
    ['POST', '/api/meetings/:id/chat'],
  ] as const)('%s %s gives the same 404 for malformed and missing IDs', async (method, path) => {
    const missing = await request(method, path.replace(':id', MISSING_ID));
    expect(missing.status).toBe(404);
    const expected = await missing.json();
    expect(expected).toEqual({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });

    // Document creation is deliberately limited to three attempts per user and minute. Its
    // limiter runs before the ID lookup, so four requests here would test the 429 boundary.
    const ids = method === 'POST' && path.endsWith('/document')
      ? MALFORMED_IDS.slice(0, 2) : MALFORMED_IDS;
    for (const malformed of ids) {
      const response = await request(method, path.replace(':id', malformed));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(expected);
    }
    expect(transcript.getByMeetingId).not.toHaveBeenCalled();
    expect(document.getByMeetingId).not.toHaveBeenCalled();
    expect(document.claimGeneration).not.toHaveBeenCalled();
    expect(chat.ask).not.toHaveBeenCalled();
    expect(chat.getHistory).not.toHaveBeenCalled();
  });

  it('still reads an owned meeting through the same repository and HTTP stack', async () => {
    const created = await meetingRepo.create({ ownerUserId: owner.id, source: 'bot' });
    const response = await request('GET', `/api/meetings/${created.id}`);
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(created.id);
  });
});
