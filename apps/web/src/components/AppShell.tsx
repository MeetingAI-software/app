'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getMe, logout, getUsage, type User, type UsageSummary } from '@/lib/api';
import { shouldRequireEmailVerification } from '@/lib/email-verification';
import {
  EMAIL_VERIFICATION_COMPLETED_EVENT,
  EMAIL_VERIFICATION_STORAGE_KEY,
} from '@/lib/verify-email';
import VerificationRequired from '@/components/VerificationRequired';
import { Logo } from '@/components/Logo';

/**
 * Session shell for the protected app (/meetings*, /settings). Probes /api/auth/me on mount and
 * bounces to /login if there's no valid session; renders the header (nav, email, usage, logout)
 * once authenticated. Any mid-session 401 from the API client fires 'unauthorized-api-call' → /login.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);

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
    getUsage().then(setUsage).catch(() => {}); // best-effort; the header just omits it on failure
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
    <div className="min-h-screen bg-transparent text-slate-900 flex flex-col">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-surface-container-lowest/80 backdrop-blur-md shadow-sm print:hidden">
        <div className="max-w-container-max mx-auto px-margin-page h-16 flex items-center justify-between gap-4">
          <Link
            href="/meetings"
            className="font-headline-md text-headline-md font-bold tracking-tight text-slate-900 flex items-center gap-2"
          >
            <Logo />
            Syncmemos
          </Link>

          <div className="flex items-center gap-2 sm:gap-4 text-sm">
            <Link
              href="/meetings"
              className="hidden sm:inline text-on-surface-variant hover:text-secondary transition-colors font-medium"
            >
              Meetings
            </Link>

            {usage && (
              <span
                className="hidden sm:inline text-on-surface-variant font-medium tabular-nums font-label-mono text-xs"
                title="Recorded this month"
              >
                {formatHours(usage.secondsUsed)} / {formatHours(usage.secondsCap)} h
              </span>
            )}

            {user && <span className="hidden md:inline text-slate-400 text-xs">{user.email}</span>}

            <Link
              href="/settings"
              className="text-on-surface-variant hover:text-secondary transition-colors font-medium inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              <span className="hidden sm:inline">Settings</span>
            </Link>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 rounded px-3 py-1.5 text-sm font-medium transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}
