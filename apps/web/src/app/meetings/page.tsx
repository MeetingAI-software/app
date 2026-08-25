'use client';

import { useEffect, useState } from 'react';
import { getMeetings, type Meeting } from '@/lib/api';
import { ownerFromEmail } from '@/lib/feed';
import MemoFeed from '@/components/console/MemoFeed';
import { useSession } from '@/components/console/session';

/**
 * The console home (SPEC §4): the date-grouped memo feed.
 *
 * Cards link to the existing meeting page at /meetings/[id], which is unchanged — the redesigned
 * detail page is design file 02 and a separate job.
 *
 * NOTE: this replaced the old list page, which also carried NewMeetingPanel — the only way to
 * start a meeting. The design puts that behind the top bar's Record / Import buttons (SPEC §3.6),
 * which are not built yet, so there is currently no way to create a meeting from here.
 */
export default function ConsoleHomePage() {
  const { user } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    <MemoFeed
      meetings={meetings}
      owner={ownerFromEmail(user?.email)}
      loading={loading}
      error={error}
    />
  );
}
