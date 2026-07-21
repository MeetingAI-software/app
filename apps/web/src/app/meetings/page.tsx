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
    const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border';
    switch (status) {
      case 'transcribed':
        return `${baseClass} bg-green-50 text-green-700 border-green-200/50`;
      case 'failed':
        return `${baseClass} bg-red-50 text-red-700 border-red-200/50`;
      case 'pending':
        return `${baseClass} bg-yellow-50 text-yellow-700 border-yellow-200/50`;
      case 'bot_joining':
      case 'recording':
      case 'processing':
        return `${baseClass} bg-blue-50 text-blue-700 border-blue-200/50`;
      default:
        return `${baseClass} bg-slate-50 text-slate-700 border-slate-200/50`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-slate-950 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-500 font-medium">Loading your meetings...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-slate-950 pt-28 pb-12 px-6">
      {/* TopNavBar */}
      <header className="bg-white/80 backdrop-blur-md font-body-md text-body-md fixed top-0 w-full z-50 border-b border-slate-200 shadow-sm">
        <div className="flex justify-between items-center px-6 py-4 max-w-4xl mx-auto">
          <Link href="/" className="font-headline-md text-headline-md font-bold tracking-tight text-slate-900 flex items-center gap-2 hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>summarize</span>
            MeetingAI
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">
              Home
            </Link>
            <Link href="/meetings" className="text-slate-900 font-bold text-sm transition-colors">
              Console
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Your Meetings</h1>
        </div>

        <NewMeetingPanel />

        {error && (
          <div className="bg-red-50 border border-red-200/50 text-red-700 p-4 rounded-xl mb-6 text-sm font-medium">
            Error: {error}
          </div>
        )}

        {meetings.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
            No meetings found. Create one to get started!
          </div>
        ) : (
          <div className="grid gap-4">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 hover:border-slate-300 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={getStatusBadge(meeting.status)}>{meeting.status}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/30">
                      {meeting.source === 'upload' ? 'In-room' : 'Online'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(meeting.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 break-all">{meetingTitle(meeting)}</h2>
                  {meeting.durationSeconds && (
                    <p className="text-sm text-slate-600 mt-1 font-medium">
                      Duration: {msToClock(meeting.durationSeconds * 1000)}
                    </p>
                  )}
                  {meeting.errorMessage && (
                    <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-200/50">
                      Error: {meeting.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="w-full md:w-auto text-center px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 rounded-lg font-semibold text-sm transition-all shadow-sm"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
