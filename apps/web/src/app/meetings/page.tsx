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

export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  let meetings: Meeting[] = [];
  let error: string | null = null;

  try {
    meetings = await getMeetings();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to fetch meetings';
  }

  const getStatusBadge = (status: string) => {
    const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider';
    switch (status) {
      case 'transcribed':
        return `${baseClass} bg-green-900 text-green-200`;
      case 'failed':
        return `${baseClass} bg-red-900 text-red-200`;
      case 'pending':
        return `${baseClass} bg-yellow-900 text-yellow-200`;
      case 'bot_joining':
      case 'recording':
      case 'processing':
        return `${baseClass} bg-blue-900 text-blue-200`;
      default:
        return `${baseClass} bg-gray-900 text-gray-200`;
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Your Meetings</h1>
        </div>

        <NewMeetingPanel />

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-200 p-4 rounded-lg mb-6">
            Error: {error}
          </div>
        )}

        {meetings.length === 0 ? (
          <div className="bg-[#13171c] border border-gray-800 rounded-xl p-12 text-center text-gray-400">
            No meetings found. Create one to get started!
          </div>
        ) : (
          <div className="grid gap-4">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="bg-[#13171c] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={getStatusBadge(meeting.status)}>{meeting.status}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-800 text-gray-300">
                      {meeting.source === 'upload' ? 'In-room' : 'Online'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(meeting.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-white break-all">{meetingTitle(meeting)}</h2>
                  {meeting.durationSeconds && (
                    <p className="text-sm text-gray-400 mt-1">
                      Duration: {msToClock(meeting.durationSeconds * 1000)}
                    </p>
                  )}
                  {meeting.errorMessage && (
                    <p className="text-xs text-red-400 mt-2 bg-red-950/50 p-2 rounded border border-red-900/50">
                      Error: {meeting.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="w-full md:w-auto text-center px-4 py-2 bg-gray-800 hover:bg-gray-750 text-white rounded-lg font-medium text-sm transition-colors"
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
