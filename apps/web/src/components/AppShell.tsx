'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getMe, logout, getUsage, type User, type UsageSummary } from '@/lib/api';

/**
 * Session shell for the protected app (/meetings*, /settings). Probes /api/auth/me on mount and
 * bounces to /login if there's no valid session; renders the header (email, usage, logout) once
 * authenticated. Any mid-session 401 from the API client fires 'unauthorized-api-call' → /login.
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
    return <div className="min-h-screen bg-[#0d0f12]" />;
  }

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-900 bg-[#0d0f12]/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/meetings" className="font-extrabold tracking-tight text-white">
            MeetingAI
          </Link>
          <div className="flex items-center gap-4 text-xs">
            {usage && (
              <span className="text-gray-400 tabular-nums" title="Recorded this month">
                {formatHours(usage.secondsUsed)} / {formatHours(usage.secondsCap)} h
              </span>
            )}
            {user && <span className="hidden sm:inline text-gray-500">{user.email}</span>}
            <Link href="/settings" className="text-gray-400 hover:text-white transition-colors">
              Settings
            </Link>
            <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors">
              Log out
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
