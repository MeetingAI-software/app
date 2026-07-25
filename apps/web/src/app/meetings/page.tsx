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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return dateStr;
  }
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMeetings();
      setMeetings(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch meetings');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const base = 'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border';
    switch (status) {
      case 'transcribed':
        return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
      case 'failed':
        return `${base} bg-red-50 text-red-700 border-red-200`;
      case 'pending':
        return `${base} bg-amber-50 text-amber-700 border-amber-200`;
      case 'bot_joining':
      case 'recording':
      case 'processing':
        return `${base} bg-blue-50 text-blue-700 border-blue-200`;
      default:
        return `${base} bg-slate-100 text-slate-600 border-slate-200`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-slate-900 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-on-surface-variant font-medium">Loading your meetings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-headline-lg text-3xl font-bold tracking-tight text-slate-900">Your meetings</h1>
      </div>

      <NewMeetingPanel />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm font-medium">
          Error: {error}
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-12 text-center text-on-surface-variant shadow-sm">
          No meetings found. Create one to get started!
        </div>
      ) : (
        <div className="grid gap-4">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="block bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 hover:border-slate-300 hover:shadow-md transition-all shadow-sm group"
            >
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className={getStatusBadge(meeting.status)}>{meeting.status}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                  {meeting.source === 'upload' ? 'In-room' : 'Online'}
                </span>
                <span className="text-xs text-slate-400 font-label-mono">{formatDate(meeting.createdAt)}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 group-hover:text-secondary transition-colors break-all">
                {meetingTitle(meeting)}
              </h2>
              {meeting.durationSeconds && (
                <p className="text-sm text-on-surface-variant mt-1 font-medium">
                  Duration: {msToClock(meeting.durationSeconds * 1000)}
                </p>
              )}
              {meeting.errorMessage && (
                <p className="text-xs text-red-700 mt-2 bg-red-50 p-2 rounded border border-red-200">
                  Error: {meeting.errorMessage}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
