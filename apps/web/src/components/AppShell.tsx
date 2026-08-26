'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMe,
  getSubscription,
  getUsage,
  logout,
  type SubscriptionSummary,
  type UsageSummary,
  type User,
} from '@/lib/api';
import { shouldRequireEmailVerification } from '@/lib/email-verification';
import {
  EMAIL_VERIFICATION_COMPLETED_EVENT,
  EMAIL_VERIFICATION_STORAGE_KEY,
} from '@/lib/verify-email';
import VerificationRequired from '@/components/VerificationRequired';
import Rail from '@/components/console/Rail';
import { SessionProvider } from '@/components/console/session';

/**
 * Session shell for the protected app (/meetings*, /settings). Probes /api/auth/me on mount and
 * bounces to /login if there's no valid session. Once authenticated it renders the console frame
 * from SPEC §3.1: the left navigation rail, a top bar, and the page content beside them. Any
 * mid-session 401 from the API client fires 'unauthorized-api-call' → /login.
 *
 * The rail replaces the old top header, whose nav/account/usage controls now live inside it.
 * The top bar currently carries only the rail toggle (SPEC §3.6, item 1) — the search pill and
 * the Import/Record cluster belong to later passes.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    getMe()
      .then(({ user }) => {
        if (!active) return;
        setUser(user);
        setChecked(true);
      })
      .catch(() => router.replace('/login'));
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    // Both are best-effort; the rail's usage card degrades to a placeholder on failure.
    getUsage().then(setUsage).catch(() => {});
    getSubscription().then(setSubscription).catch(() => {});
  }, [user]);

  useEffect(() => {
    const onUnauthorized = () => router.replace('/login');
    window.addEventListener('unauthorized-api-call', onUnauthorized);
    return () => window.removeEventListener('unauthorized-api-call', onUnauthorized);
  }, [router]);

  useEffect(() => {
    const refreshUser = () => {
      getMe().then(({ user }) => setUser(user)).catch(() => {});
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === EMAIL_VERIFICATION_STORAGE_KEY) refreshUser();
    };

    window.addEventListener(EMAIL_VERIFICATION_COMPLETED_EVENT, refreshUser);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EMAIL_VERIFICATION_COMPLETED_EVENT, refreshUser);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // even if the call fails, clear the client and move on
    }
    router.replace('/login');
  };

  // Avoid flashing protected content before the session is confirmed.
  if (!checked) {
    return <div className="min-h-screen bg-transparent" />;
  }

  // The API rejects every gated route for an unverified address, so rendering the app would only
  // show a shell of failed requests. This is the client-side half of that gate, not the gate itself.
  if (shouldRequireEmailVerification(user) && user) {
    return (
      <VerificationRequired
        user={user}
        onLogout={handleLogout}
        onEmailChanged={setUser}
      />
    );
  }

  return (
    <div className="sm-console h-screen flex overflow-hidden">
      <Rail
        user={user}
        usage={usage}
        subscription={subscription}
        collapsed={railCollapsed}
        onExpandRail={() => setRailCollapsed(false)}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--sm-bg)' }}>
        <div
          className="flex-none h-[60px] flex items-center gap-[12px] px-[18px] print:hidden"
          style={{ background: 'var(--sm-surface)', borderBottom: '1px solid var(--sm-line)' }}
        >
          <button
            type="button"
            onClick={() => setRailCollapsed((collapsed) => !collapsed)}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            aria-expanded={!railCollapsed}
            className="flex-none w-[32px] h-[32px] rounded-[9px] border-0 bg-transparent cursor-pointer grid place-items-center text-[var(--sm-ink-2)] transition-[background,color] duration-[160ms] hover:bg-[var(--sm-surface-2)] hover:text-[var(--sm-ink)]"
          >
            <span className="material-symbols-outlined text-[19px] leading-none">
              {railCollapsed ? 'left_panel_open' : 'left_panel_close'}
            </span>
          </button>
        </div>

        {/* SPEC §4: the scroll region is the area under the top bar, scrollbar hidden. Owning
            it here keeps every page under the shell scrollable, not just the feed. */}
        <main className="sm-scroll relative flex-1 min-h-0 overflow-y-auto">
          <SessionProvider value={{ user, usage, subscription }}>
            {children}
          </SessionProvider>
        </main>
      </div>
    </div>
  );
}
