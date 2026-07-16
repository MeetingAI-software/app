'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingUrl) return;

    setLoading(true);
    setError(null);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    try {
      const res = await fetch(`${API_BASE}/api/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meetingUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.message || 'Failed to create meeting');
      }

      const meeting = await res.json();
      router.push(`/meetings/${meeting.id}`);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <div className="inline-block bg-indigo-500/10 text-indigo-400 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider mb-3 border border-indigo-500/20">
            MeetingAI Platform
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4 bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
            Perfect Meeting Documents
          </h1>
          <p className="text-gray-400 text-lg">
            Transform Zoom transcripts into beautiful, shareable documents, summaries, and action plans.
          </p>
        </div>

        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-8 shadow-xl backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="meeting-url" className="block text-sm font-semibold text-gray-300 mb-2">
                Zoom Meeting URL
              </label>
              <input
                id="meeting-url"
                type="url"
                required
                placeholder="https://us02web.zoom.us/j/..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                disabled={loading}
                className="w-full bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-900/50 text-red-200 p-4 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading || !meetingUrl}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-xl py-3.5 font-semibold text-sm transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] disabled:scale-100 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Adding bot to Zoom...
                  </>
                ) : (
                  'Start Meeting Bot'
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center mt-8">
          <Link
            href="/meetings"
            className="text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors inline-flex items-center gap-1.5"
          >
            View past meetings
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
