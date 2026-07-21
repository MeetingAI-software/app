import { describe, it, expect } from 'vitest';
import { toShareResponse } from './share-response';
import type { Meeting } from '../../../domain/types';

// Distinctive markers so the "must not leak" assertions can't match by accident.
const MEETING: Meeting = {
  id: 'internal-id-DO-NOT-LEAK',
  meetingUrl: 'https://zoom.us/j/SECRET-URL',
  platform: 'zoom',
  status: 'transcribed',
  source: 'upload',
  botId: 'bot-SECRET',
  ownerUserId: 'owner-SECRET',
  durationSeconds: 120,
  errorMessage: null,
  summary: 'A public-safe summary.',
  shareToken: 'tok_public',
  participantNames: ['SecretNameA', 'SecretNameB'],
  audioStoragePath: 'meeting-audio/SECRET.webm',
  transcriptionJobId: 'job-SECRET',
  createdAt: new Date('2026-07-18T10:00:00Z'),
  updatedAt: new Date('2026-07-18T10:05:00Z'),
};

describe('toShareResponse (public payload)', () => {
  it('exposes only the five safe meeting fields', () => {
    const res = toShareResponse(MEETING, null, []);
    expect(Object.keys(res.meeting).sort()).toEqual(
      ['createdAt', 'durationSeconds', 'shareToken', 'status', 'summary'].sort()
    );
  });

  it('keeps the safe fields (status, summary, shareToken)', () => {
    const res = toShareResponse(MEETING, null, []);
    expect(res.meeting.status).toBe('transcribed');
    expect(res.meeting.summary).toBe('A public-safe summary.');
    expect(res.meeting.shareToken).toBe('tok_public');
  });

  it('never leaks internal id, url, bot id, audio path, job id, or participant names', () => {
    const serialized = JSON.stringify(toShareResponse(MEETING, null, []));
    expect(serialized).not.toContain('DO-NOT-LEAK');
    expect(serialized).not.toContain('SECRET-URL');
    expect(serialized).not.toContain('bot-SECRET');
    expect(serialized).not.toContain('meeting-audio/SECRET.webm');
    expect(serialized).not.toContain('job-SECRET');
    expect(serialized).not.toContain('SecretNameA');
    expect(serialized).not.toContain('SecretNameB');
  });

  it('has no chat or messages field on the payload', () => {
    const res = toShareResponse(MEETING, null, []) as unknown as Record<string, unknown>;
    expect('chat' in res).toBe(false);
    expect('messages' in res).toBe(false);
    expect('chat' in (res.meeting as object)).toBe(false);
  });
});
