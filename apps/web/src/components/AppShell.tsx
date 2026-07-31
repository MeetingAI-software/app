'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, getUsage, type User, type UsageSummary } from '@/lib/api';
import { shouldShowEmailVerificationBanner } from '@/lib/email-verification';
import {
  EMAIL_VERIFICATION_COMPLETED_EVENT,
  EMAIL_VERIFICATION_STORAGE_KEY,
} from '@/lib/verify-email';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import Sidebar from '@/components/Sidebar';

/**
 * Session shell for the protected app (/meetings*, /chat, /integrations, /settings). Probes
 * /api/auth/me on mount and bounces to /login if there's no valid session. Renders the left-rail
 * Sidebar (nav + account + usage) plus a slim top bar for search, then the page content.
 * Any mid-session 401 from the API client fires 'unauthorized-api-call' → /login.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    getUsage().then(setUsage).catch(() => {}); // best-effort; the rail just omits it on failure
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

  // Avoid flashing protected content before the session is confirmed.
  if (!checked) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex">
      <Sidebar
        user={user}
        usage={usage}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-[60px] shrink-0 flex items-center gap-3 px-[18px] border-b border-zinc-200 bg-white print:hidden">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            className="w-8 h-8 rounded-lg grid place-items-center text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[19px]">
              {sidebarCollapsed ? 'dock_to_right' : 'dock_to_left'}
            </span>
          </button>

          <div className="flex-1 max-w-[520px] flex items-center gap-2.5 h-[37px] px-[15px] rounded-full border border-zinc-300 text-zinc-400">
            <span className="material-symbols-outlined text-[18px]">search</span>
            <span className="flex-1 text-[13.5px] truncate">Ask or search</span>
            <span className="text-[12px] whitespace-nowrap">⌘K</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {usage && (
              <span
                className="hidden sm:inline text-zinc-500 text-xs font-mono tabular-nums"
                title="Recorded this month"
              >
                {formatHours(usage.secondsUsed)} / {formatHours(usage.secondsCap)}h
              </span>
            )}
          </div>
        </div>

        {shouldShowEmailVerificationBanner(user) && user && (
          <EmailVerificationBanner email={user.email} />
        )}

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}
