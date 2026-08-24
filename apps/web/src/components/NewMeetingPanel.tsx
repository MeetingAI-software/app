'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, createMeeting, type SubscriptionSummary } from '@/lib/api';
import InRoomRecorder from './InRoomRecorder';
import InRoomUnavailableNotice from './InRoomUnavailableNotice';
import RecordingConsent from './RecordingConsent';
import Link from 'next/link';
import { RECORDING_NOTICE_VERSION } from '@/lib/recording-notice';

type Tab = 'online' | 'inroom';

export default function NewMeetingPanel({ subscription }: { subscription: SubscriptionSummary | null }) {
  const [tab, setTab] = useState<Tab>('online');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineRecordingConfirmed, setOnlineRecordingConfirmed] = useState(false);
  const router = useRouter();
  const inRoomRecordingEnabled = subscription?.inRoomRecordingEnabled ?? false;
  const canUseInRoom = inRoomRecordingEnabled
    && (subscription?.entitlements.phoneInRoomRecording ?? false);

  async function handleOnlineSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = meetingUrl.trim();
    if (!url) return;

    setLoading(true);
    setError(null);
    try {
      const meeting = await createMeeting(url, {
        confirmed: true,
        version: RECORDING_NOTICE_VERSION,
      });
      router.push(`/meetings/${meeting.id}`);
    } catch (err) {
      // Only reachable if the session went stale mid-page — AppShell holds unverified accounts on
      // the verification screen. The API's generic copy doesn't say what was refused, so name it.
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setError('Verify your email address before starting a meeting bot.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create meeting');
      }
      setLoading(false);
    }
  }

  const tabClass = (active: boolean) =>
    `px-5 py-1.5 rounded-full text-sm font-semibold transition-all ${
      active ? 'bg-[#0F172A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
    }`;

  return (
    <section className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-8 mb-8 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900 mb-6">New meeting</h2>

      <div className="inline-flex gap-1 mb-6 bg-slate-100/80 p-1 rounded-full border border-slate-200">
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
            <label htmlFor="meeting-url" className="block text-sm font-semibold text-slate-700 mb-2">
              Meeting URL
            </label>
            <input
              id="meeting-url"
              type="url"
              required
              placeholder="Zoom, Google Meet or Teams link"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              disabled={loading}
              className="w-full bg-white/90 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200/50 text-red-700 p-3 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          <RecordingConsent
            id="online-recording-consent"
            checked={onlineRecordingConfirmed}
            disabled={loading}
            onChange={setOnlineRecordingConfirmed}
          />

          <button
            type="submit"
            disabled={loading || !meetingUrl.trim() || !onlineRecordingConfirmed}
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg px-6 py-3 font-semibold text-sm transition-colors shadow-sm cursor-pointer"
          >
            {loading ? 'Adding bot to meeting…' : 'Start meeting bot'}
          </button>
        </form>
      ) : !inRoomRecordingEnabled ? (
        <InRoomUnavailableNotice />
      ) : canUseInRoom ? (
        <InRoomRecorder />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-bold text-slate-900">In-room recording is available on Team</h3>
          <p className="mt-1 text-sm text-slate-600">
            Your current {subscription?.plan ?? 'free'} plan still supports online meeting bots.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Compare plans
          </Link>
        </div>
      )}
    </section>
  );
}
