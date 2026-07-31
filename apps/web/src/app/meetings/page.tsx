'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMeetings, type Meeting } from '@/lib/api';
import { msToClock } from '@/lib/format';
import NewMeetingPanel from '@/components/NewMeetingPanel';

/** Upload meetings have no URL — label them by their participants instead. */
function meetingTitle(meeting: Meeting): string {
  if (meeting.meetingUrl) return meeting.meetingUrl;
  const names = meeting.participantNames ?? [];
  return names.length > 0 ? `In-room recording — ${names.join(', ')}` : 'In-room recording';
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function timeLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Groups the (already newest-first) feed into calendar days, keyed on the actual date so
 *  same-weekday labels from different years can't collide. */
function groupByDay(meetings: Meeting[]): { key: string; label: string; items: Meeting[] }[] {
  const groups = new Map<string, { key: string; label: string; items: Meeting[] }>();
  for (const m of meetings) {
    const key = new Date(m.createdAt).toDateString();
    let group = groups.get(key);
    if (!group) {
      group = { key, label: dayLabel(m.createdAt), items: [] };
      groups.set(key, group);
    }
    group.items.push(m);
  }
  return Array.from(groups.values());
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getMeetings()
      .then((data) => {
        if (active) setMeetings(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to fetch meetings');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-zinc-900 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-zinc-500 font-medium">Loading your meetings...</p>
        </div>
      </div>
    );
  }

  const groups = groupByDay(meetings);

  return (
    <div className="max-w-[1000px] mx-auto px-11 pt-1 pb-[70px]">
      <div className="pt-6">
        <NewMeetingPanel />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl my-6 text-sm font-medium">
          Error: {error}
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-zinc-500 mt-6">
          No meetings found. Create one to get started!
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <div className="flex items-center justify-between gap-3 pt-7 pb-3">
              <span className="text-[15px] font-semibold text-zinc-900 tracking-tight">{g.label}</span>
            </div>
            <div className="flex flex-col gap-[11px]">
              {g.items.map((meeting) => (
                <div key={meeting.id} className="flex items-start gap-[15px]">
                  <span className="flex-none w-[34px] h-[34px] rounded-full bg-violet-700 text-white grid place-items-center text-[18px] font-medium mt-[11px]">
                    {meetingTitle(meeting)[0]?.toUpperCase() ?? 'M'}
                  </span>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="flex-1 min-w-0 flex items-start gap-4 px-5 py-[17px] bg-white border border-zinc-200 rounded-[13px] hover:border-zinc-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[19px] font-medium tracking-tight text-zinc-900 truncate">
                          {meetingTitle(meeting)}
                        </span>
                        {meeting.status !== 'transcribed' && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
                            {meeting.status}
                          </span>
                        )}
                      </div>
                      <div className="text-[12.5px] text-zinc-400">
                        {timeLabel(meeting.createdAt)}
                        {meeting.durationSeconds ? ` · ${msToClock(meeting.durationSeconds * 1000)}` : ''}
                        {` · ${meeting.source === 'upload' ? 'In-room' : 'Online'}`}
                      </div>
                      {meeting.summary && (
                        <p className="mt-2 text-[14px] leading-relaxed text-zinc-900 line-clamp-4">
                          {meeting.summary}
                        </p>
                      )}
                      {meeting.errorMessage && (
                        <p className="text-xs text-red-700 mt-2 bg-red-50 p-2 rounded border border-red-200">
                          Error: {meeting.errorMessage}
                        </p>
                      )}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
