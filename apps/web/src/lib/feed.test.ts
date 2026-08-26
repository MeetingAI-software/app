import { describe, expect, it } from 'vitest';
import {
  avatarInitial,
  formatCardDuration,
  formatCardMeta,
  formatCardTime,
  formatDayLabel,
  groupMeetingsByDay,
  ownerFromEmail,
} from './feed';
import type { Meeting } from './api';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    meetingUrl: 'https://zoom.us/j/123',
    platform: 'zoom',
    status: 'transcribed',
    source: 'bot',
    botId: null,
    durationSeconds: 60,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: '2025-07-29T15:57:00',
    updatedAt: '2025-07-29T15:57:00',
    ...overrides,
  };
}

describe('formatDayLabel', () => {
  const now = new Date(2025, 6, 30, 12, 0, 0); // 30 Jul 2025, local

  it('labels today', () => {
    expect(formatDayLabel(new Date(2025, 6, 30, 9, 0), now)).toBe('Today');
  });

  // The exact strings the design pins down in SPEC §4.1.
  it('labels yesterday with a short month', () => {
    expect(formatDayLabel(new Date(2025, 6, 29, 15, 57), now)).toBe('Yesterday, Jul 29');
  });

  // NB: the design's fixture reads "Saturday, July 11", but 11 Jul 2025 is a Friday — the
  // prototype's copy is internally inconsistent. We assert the real weekday for a real date.
  it('labels older days with weekday and full month', () => {
    expect(formatDayLabel(new Date(2025, 6, 11, 20, 14), now)).toBe('Friday, July 11');
    expect(formatDayLabel(new Date(2026, 6, 11, 20, 14), new Date(2026, 6, 30))).toBe('Saturday, July 11');
  });

  it('compares calendar days, not elapsed hours', () => {
    // 23h58m apart but two different calendar days — still "Yesterday".
    const lateYesterday = new Date(2025, 6, 29, 23, 58);
    expect(formatDayLabel(lateYesterday, new Date(2025, 6, 30, 0, 1))).toBe('Yesterday, Jul 29');
  });
});

describe('formatCardTime', () => {
  it('renders 12-hour time without a leading zero', () => {
    expect(formatCardTime(new Date(2025, 6, 29, 15, 57))).toBe('3:57 PM');
    expect(formatCardTime(new Date(2025, 6, 29, 8, 4))).toBe('8:04 AM');
  });
});

describe('formatCardDuration', () => {
  it('renders the design’s short forms', () => {
    expect(formatCardDuration(7)).toBe('7 sec');
    expect(formatCardDuration(45)).toBe('45 sec');
    expect(formatCardDuration(60)).toBe('1 min');
    expect(formatCardDuration(200)).toBe('3 min');
  });

  it('rolls over into hours', () => {
    expect(formatCardDuration(3600)).toBe('1 h');
    expect(formatCardDuration(3900)).toBe('1 h 5 min');
  });

  it('returns null when the duration is unknown or nonsense', () => {
    expect(formatCardDuration(null)).toBeNull();
    expect(formatCardDuration(-5)).toBeNull();
    expect(formatCardDuration(Number.NaN)).toBeNull();
  });
});

describe('ownerFromEmail / avatarInitial', () => {
  it('uses the local part as the stand-in name', () => {
    expect(ownerFromEmail('meetingai@gmail.com')).toBe('meetingai');
    expect(avatarInitial(ownerFromEmail('meetingai@gmail.com'))).toBe('M');
  });

  it('degrades safely with no email', () => {
    expect(ownerFromEmail(null)).toBeNull();
    expect(ownerFromEmail('')).toBeNull();
    expect(avatarInitial(null)).toBe('?');
  });
});

describe('formatCardMeta', () => {
  it('joins time, duration and owner with the design’s separator', () => {
    expect(formatCardMeta(meeting({ durationSeconds: 60 }), 'AbdulRehman Khan'))
      .toBe('3:57 PM · 1 min · AbdulRehman Khan');
  });

  it('drops the parts it does not know', () => {
    expect(formatCardMeta(meeting({ durationSeconds: null }), null)).toBe('3:57 PM');
  });
});

describe('groupMeetingsByDay', () => {
  const now = new Date(2025, 6, 30, 12, 0, 0);

  it('buckets by calendar day, newest first', () => {
    const groups = groupMeetingsByDay(
      [
        meeting({ id: 'old', createdAt: '2025-07-11T20:14:00' }),
        meeting({ id: 'new', createdAt: '2025-07-29T15:57:00' }),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Yesterday, Jul 29', 'Friday, July 11']);
    expect(groups[0].meetings.map((m) => m.id)).toEqual(['new']);
  });

  it('orders meetings within a day newest first', () => {
    const groups = groupMeetingsByDay(
      [
        meeting({ id: 'early', createdAt: '2025-07-29T14:04:00' }),
        meeting({ id: 'late', createdAt: '2025-07-29T15:57:00' }),
      ],
      now,
    );
    expect(groups[0].meetings.map((m) => m.id)).toEqual(['late', 'early']);
  });

  it('skips meetings with an unparseable timestamp instead of throwing', () => {
    const groups = groupMeetingsByDay([meeting({ createdAt: 'not-a-date' })], now);
    expect(groups).toEqual([]);
  });
});
