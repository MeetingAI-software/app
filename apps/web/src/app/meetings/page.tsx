'use client';

import { useEffect, useState } from 'react';
import { getMeetings, type Meeting } from '@/lib/api';
import { ownerFromEmail } from '@/lib/feed';
import MemoFeed from '@/components/console/MemoFeed';
import NewMeetingPanel from '@/components/NewMeetingPanel';
import { useSession } from '@/components/console/session';

/**
 * The console home (SPEC §4): the date-grouped memo feed.
 *
 * Cards link to the existing meeting page at /meetings/[id], which is unchanged — the redesigned
 * detail page is design file 02 and a separate job.
 *
 * INTERIM — meeting creation. SPEC §3.6 puts Record / Import in the top bar, and that cluster is
 * not built. Until it is, creation lives here behind a disclosure: the redesign removed the old
 * list page's NewMeetingPanel, which was the app's only entry point to *both* creation flows
 * (online bot + in-room recording), leaving no way to start a meeting from anywhere in the UI.
 * A collapsed button keeps the feed clean, which is what the design wants, without shipping a
 * console you cannot record from. Delete this block when the top-bar cluster lands.
 */
export default function ConsoleHomePage() {
  const { user, subscription } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setError(null);
        const data = await getMeetings();
        if (active) setMeetings(data);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to fetch meetings');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      {/* Aligned to MemoFeed's own 1000px column so the control sits flush with the cards. */}
      <div className="w-full max-w-[1000px] mx-auto px-[44px] pt-[18px]">
        <button
          type="button"
          onClick={() => setComposing((open) => !open)}
          aria-expanded={composing}
          className="inline-flex items-center gap-[7px] rounded-[9px] px-[14px] py-[9px] text-[13px] font-semibold cursor-pointer border-0 font-[inherit] transition-opacity duration-[180ms] hover:opacity-90"
          style={{ background: 'var(--sm-invert-bg)', color: 'var(--sm-invert-fg)' }}
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            {composing ? 'close' : 'add'}
          </span>
          {composing ? 'Cancel' : 'New meeting'}
        </button>

        {composing && (
          <div className="mt-[14px]">
            <NewMeetingPanel subscription={subscription} />
          </div>
        )}
      </div>

      <MemoFeed
        meetings={meetings}
        owner={ownerFromEmail(user?.email)}
        loading={loading}
        error={error}
      />
    </>
  );
}
