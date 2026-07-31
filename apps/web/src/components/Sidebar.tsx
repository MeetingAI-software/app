'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout, type User, type UsageSummary } from '@/lib/api';

/**
 * Left rail nav for the protected console, replacing the old top header's nav/account controls.
 * Renders either a 248px expanded rail or a 64px icon-only rail (`collapsed`).
 *
 * Home and Meetings share /meetings — the only list page that exists — so they use explicit
 * match rules (see `isActive`) to avoid both lighting up at once: Home owns the feed root,
 * Meetings owns an open meeting.
 */
type NavItem = {
  label: string;
  href: string;
  icon: string;
  /** How the pathname maps to this item; 'exact' + 'sub' keep /meetings unambiguous. */
  match: 'exact' | 'sub' | 'prefix';
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/meetings', icon: 'home', match: 'exact' },
  { label: 'AI Chat', href: '/chat', icon: 'AI_CHAT', match: 'prefix' }, // special-cased below for the earth icon
  { label: 'Meetings', href: '/meetings', icon: 'calendar_month', match: 'sub' },
  { label: 'Integrations', href: '/integrations', icon: 'extension', match: 'prefix' },
];

// Static for now — no folders API exists in lib/api.ts yet.
const FOLDERS = ['General', 'Sales calls', 'Design reviews'];

function isActive(pathname: string, item: NavItem) {
  if (item.match === 'exact') return pathname === item.href;
  if (item.match === 'sub') return pathname.startsWith(item.href + '/');
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/** Two pupils dart left/right every 4-5s; the circle itself never moves. */
function EarthIcon({ size = 22 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full bg-emerald-500 overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_30%,#fff,transparent_60%)]" />
      <span className="flex gap-[3px] earth-eyes">
        <span className="w-[3px] h-[3px] rounded-full bg-white" />
        <span className="w-[3px] h-[3px] rounded-full bg-white" />
      </span>
    </span>
  );
}

function AccountMenu({ onLogout, className }: { onLogout: () => void; className: string }) {
  const item = 'flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] text-zinc-800 hover:bg-zinc-50';
  return (
    <div
      className={`z-20 bg-white border border-zinc-200 rounded-xl shadow-lg py-1.5 overflow-hidden ${className}`}
    >
      <Link href="/pricing" className={item}>
        <span className="material-symbols-outlined text-[18px] text-zinc-500">bolt</span>Upgrade
      </Link>
      <Link href="/settings" className={item}>
        <span className="material-symbols-outlined text-[18px] text-zinc-500">settings</span>Settings
      </Link>
      <button onClick={onLogout} className={`w-full text-left ${item}`}>
        <span className="material-symbols-outlined text-[18px] text-zinc-500">logout</span>Log out
      </button>
    </div>
  );
}

function UsageBar({ usage }: { usage: UsageSummary }) {
  const pct = usage.secondsCap > 0 ? Math.min(100, (usage.secondsUsed / usage.secondsCap) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
      <div className="h-full bg-zinc-900 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Sidebar({
  user,
  usage,
  collapsed,
  onToggleCollapsed,
}: {
  user: User | null;
  usage: UsageSummary | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // clear client and move on even if the call fails
    }
    router.replace('/login');
  };

  const initial = (user?.email?.[0] ?? 'S').toUpperCase();
  const usageLabel = usage
    ? `${formatHours(usage.secondsUsed)} / ${formatHours(usage.secondsCap)}h recorded this month`
    : undefined;

  if (collapsed) {
    return (
      <aside className="w-[64px] shrink-0 h-screen sticky top-0 flex flex-col items-center border-r border-zinc-200 bg-white print:hidden">
        <div className="relative pt-3 pb-2" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title={user?.email ?? 'Account'}
            className="w-9 h-9 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            {initial}
          </button>
          {menuOpen && (
            <AccountMenu onLogout={handleLogout} className="absolute left-[46px] top-3 w-[190px]" />
          )}
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-1 pt-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                className={`w-10 h-10 rounded-lg grid place-items-center transition-colors ${
                  active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                {item.icon === 'AI_CHAT' ? (
                  <EarthIcon size={20} />
                ) : (
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                )}
              </Link>
            );
          })}

          <button
            onClick={onToggleCollapsed}
            title="Folders"
            aria-label="Folders"
            className="w-10 h-10 mt-2 rounded-lg grid place-items-center text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">folder</span>
          </button>
        </nav>

        {usage && (
          <div className="flex-none w-full px-3 pb-3" title={usageLabel}>
            <UsageBar usage={usage} />
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-[248px] shrink-0 h-screen sticky top-0 flex flex-col border-r border-zinc-200 bg-white print:hidden">
      {/* account */}
      <div className="relative px-3 pt-3 pb-2" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-100 transition-colors text-left"
        >
          <span className="flex-none w-8 h-8 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-semibold">
            {initial}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-medium text-zinc-900 truncate">
              {user?.email ?? 'Syncmemos'}
            </span>
          </span>
          <span className="material-symbols-outlined text-[18px] text-zinc-400">unfold_more</span>
        </button>

        {menuOpen && (
          <AccountMenu
            onLogout={handleLogout}
            className="absolute left-3 right-3 top-[calc(100%-4px)]"
          />
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {item.icon === 'AI_CHAT' ? (
                <EarthIcon size={20} />
              ) : (
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              )}
              <span className={`text-[15px] ${active ? 'font-semibold' : 'font-light'}`}>{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setFoldersOpen((v) => !v)}
          aria-expanded={foldersOpen}
          className="flex items-center gap-2.5 px-2.5 py-2 mt-2 rounded-lg text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">
            {foldersOpen ? 'expand_more' : 'chevron_right'}
          </span>
          <span className="text-[13px] font-medium uppercase tracking-wide text-zinc-400">Folders</span>
        </button>
        {foldersOpen && (
          <div className="flex flex-col gap-0.5 pl-4">
            {FOLDERS.map((f) => (
              <button
                key={f}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-zinc-400">folder</span>
                <span className="text-[14px] font-light truncate">{f}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* bottom cards */}
      <div className="flex-none p-3 flex flex-col gap-2.5">
        <div className="rounded-xl border border-zinc-200 p-3.5 bg-zinc-50">
          <p className="text-[13px] font-semibold text-zinc-900 mb-1">Your weekly digest</p>
          <p className="text-[12px] text-zinc-500 leading-snug mb-2.5">
            A summary of last week&apos;s meetings, every Monday.
          </p>
          <button className="text-[12.5px] font-medium text-zinc-900 underline underline-offset-2">
            Turn on
          </button>
        </div>

        {usage && (
          <div className="rounded-xl border border-zinc-200 p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12.5px] font-medium text-zinc-700">Plan usage</span>
              <span className="text-[11px] font-mono text-zinc-400">
                {formatHours(usage.secondsUsed)} / {formatHours(usage.secondsCap)}h
              </span>
            </div>
            <UsageBar usage={usage} />
          </div>
        )}
      </div>
    </aside>
  );
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}
