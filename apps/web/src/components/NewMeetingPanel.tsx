'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMeeting } from '@/lib/api';
import InRoomRecorder from './InRoomRecorder';

type Tab = 'online' | 'inroom';

export default function NewMeetingPanel() {
  const [tab, setTab] = useState<Tab>('online');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleOnlineSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = meetingUrl.trim();
    if (!url) return;

    setLoading(true);
    setError(null);
    try {
      const meeting = await createMeeting(url);
      router.push(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
      setLoading(false);
    }
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
    }`;

  return (
    <section className="bg-[#13171c] border border-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold text-white mb-4">New meeting</h2>

      <div className="inline-flex gap-1 mb-6 bg-[#0d0f12] p-1 rounded-lg border border-gray-800">
        <button type="button" onClick={() => setTab('online')} className={tabClass(tab === 'online')}>
          Online
        </button>
        <button type="button" onClick={() => setTab('inroom')} className={tabClass(tab === 'inroom')}>
          In-room
        </button>
      </div>

      {tab === 'online' ? (
        <form onSubmit={handleOnlineSubmit} className="space-y-4">
          <div>
            <label htmlFor="meeting-url" className="block text-sm font-semibold text-gray-300 mb-2">
              Zoom meeting URL
            </label>
            <input
              id="meeting-url"
              type="url"
              required
              placeholder="https://us02web.zoom.us/j/..."
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              disabled={loading}
              className="w-full bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-900/50 text-red-200 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !meetingUrl.trim()}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-6 py-3 font-semibold text-sm transition-colors"
          >
            {loading ? 'Adding bot to Zoom…' : 'Start meeting bot'}
          </button>
        </form>
      ) : (
        <InRoomRecorder />
      )}
    </section>
  );
}
