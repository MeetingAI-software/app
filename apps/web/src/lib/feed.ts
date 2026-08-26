import type { Meeting } from '@/lib/api';

/**
 * Presentation helpers for the console memo feed (SPEC §4).
 *
 * These are pure so the date and duration strings — which the design pins down exactly
 * ("Yesterday, Jul 29", "3:57 PM", "7 sec", "1 min") — can be tested without a browser.
 */

/** SPEC §4.1: "Today", then "Yesterday, Jul 29", then "Saturday, July 11". */
export function formatDayLabel(value: Date, now: Date = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const daysApart = Math.round((startOfDay(now) - startOfDay(value)) / dayMs);

  if (daysApart === 0) return 'Today';
  if (daysApart === 1) {
    const month = value.toLocaleDateString('en-US', { month: 'short' });
    return `Yesterday, ${month} ${value.getDate()}`;
  }
  const weekday = value.toLocaleDateString('en-US', { weekday: 'long' });
  const month = value.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${month} ${value.getDate()}`;
}

/** SPEC §4.2 meta line: "3:57 PM". */
export function formatCardTime(value: Date): string {
  return value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** SPEC §4.2 meta line: "7 sec", "45 sec", "1 min", "3 min". */
export function formatCardDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} sec`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * The API has no display name — accounts are identified by email only. The design's meta line and
 * avatar both want a person, so the local part of the address stands in for one. It is derived
 * from real data rather than invented, but it is not a real name; adding one needs an API change.
 */
export function ownerFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  return local ? local : null;
}

export function avatarInitial(owner: string | null): string {
  return (owner?.[0] ?? '?').toUpperCase();
}

/** Upload meetings have no URL — label them by their participants instead. */
export function meetingTitle(meeting: Meeting): string {
  if (meeting.meetingUrl) return meeting.meetingUrl;
  const names = meeting.participantNames ?? [];
  return names.length > 0 ? `In-room recording — ${names.join(', ')}` : 'In-room recording';
}

/** SPEC §4.2: "<time> · <duration> · <owner>", each part dropped when unknown. */
export function formatCardMeta(meeting: Meeting, owner: string | null): string {
  const parts = [
    formatCardTime(new Date(meeting.createdAt)),
    formatCardDuration(meeting.durationSeconds),
    owner,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

export interface FeedDayGroup {
  /** Stable key for the day, independent of the label's wording. */
  key: string;
  label: string;
  meetings: Meeting[];
}

/**
 * Groups meetings into day buckets, newest day first and newest meeting first within a day.
 * Meetings with an unparseable timestamp are dropped rather than crashing the feed.
 */
export function groupMeetingsByDay(meetings: Meeting[], now: Date = new Date()): FeedDayGroup[] {
  const buckets = new Map<string, { date: Date; meetings: Meeting[] }>();

  for (const meeting of meetings) {
    const date = new Date(meeting.createdAt);
    if (Number.isNaN(date.getTime())) continue;

    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.meetings.push(meeting);
    else buckets.set(key, { date, meetings: [meeting] });
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].date.getTime() - a[1].date.getTime())
    .map(([key, bucket]) => ({
      key,
      label: formatDayLabel(bucket.date, now),
      meetings: bucket.meetings.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
}
