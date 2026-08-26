'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PLANS } from '@/lib/pricing';
import type { SubscriptionSummary, UsageSummary, User } from '@/lib/api';
import { AiChatIcon, HomeIcon, SyncmemosMark } from '@/components/console/icons';
import {
  DEFAULT_ACTIVE_ID,
  DEFAULT_EXPANDED,
  NAV_HREFS,
  NAV_ITEMS,
  type NavIcon,
  type NavItem,
} from '@/components/console/nav';

/**
 * The console's left navigation rail (SPEC §3.2–§3.5).
 *
 * Measurements come from "01 Syncmemos Console (PRIMARY).dc.html" and are deliberately literal —
 * the handoff is a pixel-level contract, so the odd-looking values (13.5px, 10.5px, .12em) are
 * the design, not approximations.
 *
 * One behaviour deliberately departs from the handoff. SPEC §3.2 collapses the rail to
 * `width: 0; opacity: 0` — it disappears, taking every navigation control with it. The design
 * owner has overridden that in favour of Wispr Flow's treatment: collapsing shrinks the rail to a
 * 64px strip that still shows every icon, still marks the active item, and is still clickable.
 *
 * Making that collapse read as one motion is the fiddly part. Every row stays left-aligned in both
 * states — the icon never re-centres — and everything that does move (paddings, gaps, label widths)
 * eases on the *same* curve and duration as the rail's own width. Centring the icons in the
 * collapsed strip instead looks obvious but is wrong: `justify-content: center` applies the instant
 * the state flips, while the rail is still 260px wide, so the icon leaps to the middle of the open
 * rail and then slides back as it narrows. Left-anchored rows plus a 9px collapsed inset put the
 * glyph within a pixel of where it already was.
 *
 * `collapsed` is owned by AppShell, which also renders the top-bar toggle that drives it.
 */

const MATERIAL = 'material-symbols-outlined';

/** Rail width per state. 64 = 12px of <aside> padding either side of a 40px icon pill. */
const RAIL_WIDTH = { expanded: 260, collapsed: 64 } as const;

/** The rail's own width curve. Everything inside it eases identically so the collapse reads as one move. */
const SLIDE = '.3s cubic-bezier(.16,1,.3,1)';

/** Glyph box in the collapsed strip: 9px inset + 22px glyph + 9px inset = a 40px square. */
const GLYPH = 22;
const COLLAPSED_INSET = 9;

/** The 32px account tile centred in that same 40px square. */
const ACCOUNT_INSET = 4;

/** Handlers that raise the hover label for a collapsed row. Empty object when expanded. */
type TipProps = {
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: () => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: () => void;
};

function verticalCentreOf(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

/**
 * A text run that collapses away with the rail. Animating `max-width` rather than unmounting keeps
 * the label in the DOM so it slides out with the rail instead of popping, and leaves it readable to
 * screen readers in both states. 170px clears the longest label ("All meetings", "Integrations")
 * without leaving slack at the end of the ease.
 */
function RailLabel({
  collapsed,
  className = '',
  children,
}: {
  collapsed: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap ${className}`}
      style={{
        maxWidth: collapsed ? 0 : 170,
        opacity: collapsed ? 0 : 1,
        transition: `max-width ${SLIDE}, opacity .18s ease`,
      }}
    >
      {children}
    </span>
  );
}

function NavGlyph({ icon, active, collapsed }: { icon: NavIcon; active: boolean; collapsed: boolean }) {
  const color = active ? 'var(--sm-ink)' : 'var(--sm-ink-2)';

  if (icon.kind === 'svg') {
    // AI Chat sits in the standard 22px glyph box and tints with the nav state like every
    // other icon.
    if (icon.name === 'aichat') {
      return (
        <span className="flex-none grid place-items-center w-[22px] h-[22px]" style={{ color }}>
          <AiChatIcon size={22} />
        </span>
      );
    }
    // SPEC §3.4 gave Home a 19px slot, narrower than every other row's; nudged to 23px on
    // request, which now runs 1px over the 22px the other rows use. The collapsed strip still
    // pads the slot to 22px so all five icons line up and every row is the same 40px square.
    return (
      <span
        className="flex-none grid place-items-center"
        style={{ width: collapsed ? GLYPH : 23, height: collapsed ? GLYPH : 23, color }}
      >
        <HomeIcon size={23} />
      </span>
    );
  }

  return (
    <span className={`${MATERIAL} flex-none text-[22px] leading-none`} style={{ color }}>
      {icon.glyph}
    </span>
  );
}

export default function Rail({
  user,
  usage,
  subscription,
  collapsed,
  onExpandRail,
  onLogout,
}: {
  user: User | null;
  usage: UsageSummary | null;
  subscription: SubscriptionSummary | null;
  collapsed: boolean;
  /** Reopens the rail. A collapsed strip has no room for the sub-items or the account menu. */
  onExpandRail: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(DEFAULT_EXPANDED);
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Derived rather than reset in an effect: a 40px-wide dropdown is unusable, so the menu is
  // simply not rendered while the rail is collapsed.
  const menuVisible = menuOpen && !collapsed;

  // Home and "All meetings" both point at /meetings, so the pathname alone cannot say which is
  // active. The prototype tracks the clicked item instead, so we derive from the click first and
  // fall back to the pathname whenever the clicked item's route no longer matches where we are —
  // which is what happens on a back/forward navigation or a direct load.
  const activeId = useMemo(() => {
    if (clickedId) {
      const clickedHref = NAV_HREFS[clickedId];
      // A routeless item (AI Chat, the Meetings filters) stays active on click, as in the design.
      if (!clickedHref || clickedHref === pathname) return clickedId;
    }
    return Object.keys(NAV_HREFS).find((id) => NAV_HREFS[id] === pathname) ?? DEFAULT_ACTIVE_ID;
  }, [clickedId, pathname]);

  useEffect(() => {
    if (!menuVisible) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuVisible]);

  const openPalette = useCallback(() => {
    // TODO: open the ⌘K command palette (SPEC §5) once it is built.
  }, []);

  /**
   * Collapsed there is no visible label, so hovering or tabbing to an icon raises its name. The
   * browser's own `title` tooltip is not enough here — it waits a second or so before appearing,
   * which reads as "nothing happens" on a strip you are scanning quickly.
   */
  const tipProps = useCallback(
    (label: string): TipProps =>
      collapsed
        ? {
            onMouseEnter: (event) => setTip({ label, top: verticalCentreOf(event.currentTarget) }),
            onMouseLeave: () => setTip(null),
            onFocus: (event) => setTip({ label, top: verticalCentreOf(event.currentTarget) }),
            onBlur: () => setTip(null),
          }
        : {},
    [collapsed],
  );

  const handleToggleGroup = (id: string) => {
    if (collapsed) {
      // Indented children don't fit a 64px strip, so opening a group opens the rail with it.
      onExpandRail();
      setExpanded((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <div
        // Wrapper: animates width. It clips, so nothing inside may overflow horizontally — see the
        // account button's comment about why the menu can't fly out to the right, and note that the
        // hover label below is rendered outside this element for the same reason.
        className="flex-none h-full overflow-hidden"
        style={{
          width: collapsed ? RAIL_WIDTH.collapsed : RAIL_WIDTH.expanded,
          background: 'var(--sm-surface)',
          borderRight: '1px solid var(--sm-line)',
          transition: `width ${SLIDE}`,
        }}
      >
        <aside className="w-full h-full flex flex-col p-[12px]">
          {/* ── Account row + menu (SPEC §3.3) ───────────────────────────────── */}
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => {
                // The menu is absolutely positioned inside a wrapper that clips to the rail's
                // width, so at 64px it would be unreadable and a flyout would be cut off.
                // Reopening the rail is simpler, and matches how a collapsed group row behaves.
                if (collapsed) return onExpandRail();
                setMenuOpen((open) => !open);
              }}
              {...tipProps('Syncmemos')}
              {...(collapsed
                ? {}
                : { 'aria-expanded': menuVisible, 'aria-haspopup': 'menu' as const })}
              className="w-full flex items-center justify-between rounded-[10px] cursor-pointer select-none border-0 bg-transparent font-[inherit] text-left hover:bg-[var(--sm-surface-3)]"
              style={{
                padding: collapsed ? ACCOUNT_INSET : 8,
                gap: collapsed ? 0 : 10,
                transition: `background .18s, padding ${SLIDE}, gap ${SLIDE}`,
              }}
            >
              <span
                className="flex items-center min-w-0"
                style={{ gap: collapsed ? 0 : 8, transition: `gap ${SLIDE}` }}
              >
                <span
                  className="flex-none w-[32px] h-[32px] rounded-[8px] grid place-items-center"
                  style={{ background: 'var(--sm-accent)', color: 'var(--sm-accent-fg)' }}
                >
                  <SyncmemosMark size={17} />
                </span>
                <RailLabel collapsed={collapsed} className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold leading-[1.2] text-[var(--sm-ink)]">
                    Syncmemos
                  </span>
                  <span className="text-[11px] leading-[1.3] text-[var(--sm-ink-3)] overflow-hidden text-ellipsis whitespace-nowrap">
                    {user?.email ?? ' '}
                  </span>
                </RailLabel>
              </span>
              {!collapsed && (
                <span
                  className={`${MATERIAL} flex-none text-[18px] text-[var(--sm-ink-3)] transition-transform duration-200`}
                  style={{ transform: menuVisible ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  expand_more
                </span>
              )}
            </button>

            {menuVisible && (
              <div
                role="menu"
                className="absolute top-[52px] left-0 right-0 z-50 rounded-[12px] p-[5px] flex flex-col gap-[2px]"
                style={{
                  background: 'var(--sm-surface)',
                  border: '1px solid var(--sm-line)',
                  boxShadow: 'var(--sm-sh-pop)',
                  animation: 'smPop .12s ease both',
                }}
              >
                <AccountMenuLink href="/pricing" glyph="bolt" label="Upgrade to Pro" onNavigate={() => setMenuOpen(false)} />
                <AccountMenuLink href="/settings" glyph="settings" label="Settings" onNavigate={() => setMenuOpen(false)} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className={ACCOUNT_MENU_ITEM}
                >
                  <span className={`${MATERIAL} text-[18px]`}>logout</span>
                  Log out
                </button>
              </div>
            )}
          </div>

          {/* ── Nav list (SPEC §3.4) ─────────────────────────────────────────── */}
          {/* mt-[14px] is the prototype's own container offset, not a sibling gap — the <aside>
              has no `gap`, so this margin is the spacing mechanism the design specifies. */}
          <nav className="sm-scroll flex-1 min-h-0 overflow-y-auto flex flex-col gap-[2px] mt-[14px] pb-[6px]">
            {NAV_ITEMS.map((item) => {
              const isExpanded = !!expanded[item.id];
              return (
                <Fragment key={item.id}>
                  <NavRow
                    item={item}
                    depth={0}
                    collapsed={collapsed}
                    active={activeId === item.id}
                    expanded={isExpanded}
                    tip={tipProps(item.label)}
                    onSelect={setClickedId}
                    onToggle={handleToggleGroup}
                    onSearch={openPalette}
                  />
                  {item.children &&
                    isExpanded &&
                    !collapsed &&
                    item.children.map((child) => (
                      <NavRow
                        key={child.id}
                        item={child}
                        depth={1}
                        collapsed={false}
                        active={activeId === child.id}
                        expanded={false}
                        tip={{}}
                        onSelect={setClickedId}
                        onToggle={() => {}}
                        onSearch={openPalette}
                      />
                    ))}
                </Fragment>
              );
            })}
          </nav>

          {/* ── Footer cards (SPEC §3.5) ─────────────────────────────────────── */}
          {/* Collapsed, the catch-up card has nowhere to go and the usage card shrinks to its ring. */}
          <div
            className="flex flex-col gap-[12px] pt-[12px] mt-[6px]"
            style={{ borderTop: '1px solid var(--sm-line)' }}
          >
            {!collapsed && (
              <section className={FOOTER_CARD}>
                <div className="text-[13px] font-semibold text-[var(--sm-ink)]">Weekly catch-up</div>
                <p className="mt-[4px] mb-[10px] text-[12px] leading-[1.5] text-[var(--sm-ink-3)]">
                  A Monday memo of everything you missed across your meetings.
                </p>
                <button
                  type="button"
                  // TODO: wire to the weekly digest opt-in once that feature exists.
                  className="inline-flex items-center gap-[6px] text-[12.5px] font-semibold cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[var(--sm-chip-fg)]"
                >
                  Turn it on
                  <span className={`${MATERIAL} text-[16px] leading-none`}>arrow_forward</span>
                </button>
              </section>
            )}

            <UsageCard
              usage={usage}
              subscription={subscription}
              collapsed={collapsed}
              tipProps={tipProps}
            />
          </div>
        </aside>
      </div>

      {/* Hover label for the collapsed strip. Rendered outside the rail wrapper and fixed to the
          viewport so the wrapper's overflow clip cannot cut it off; out of flow, so it adds nothing
          to the shell's flex row. */}
      {collapsed && tip && (
        <div
          role="tooltip"
          className="fixed z-[60] pointer-events-none rounded-[8px] px-[10px] py-[6px] text-[13px] whitespace-nowrap"
          style={{
            left: RAIL_WIDTH.collapsed + 8,
            top: tip.top,
            transform: 'translateY(-50%)',
            background: 'var(--sm-invert-bg)',
            color: 'var(--sm-invert-fg)',
            boxShadow: 'var(--sm-sh-pop)',
            animation: 'smFade .1s ease both',
          }}
        >
          {tip.label}
        </div>
      )}
    </>
  );
}

const ACCOUNT_MENU_ITEM =
  'w-full flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] text-[13px] text-left cursor-pointer border-0 bg-transparent font-[inherit] text-[var(--sm-ink-2)] transition-[background] duration-150 hover:bg-[var(--sm-surface-3)] hover:text-[var(--sm-ink)]';

const FOOTER_CARD =
  'rounded-[12px] p-[14px] bg-[var(--sm-surface-2)] border border-[var(--sm-line)]';

function AccountMenuLink({
  href,
  glyph,
  label,
  onNavigate,
}: {
  href: string;
  glyph: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={ACCOUNT_MENU_ITEM}>
      <span className={`${MATERIAL} text-[18px]`}>{glyph}</span>
      {label}
    </Link>
  );
}

function NavRow({
  item,
  depth,
  collapsed,
  active,
  expanded,
  tip,
  onSelect,
  onToggle,
  onSearch,
}: {
  item: NavItem;
  depth: number;
  collapsed: boolean;
  active: boolean;
  expanded: boolean;
  tip: TipProps;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onSearch: () => void;
}) {
  const rowStyle = {
    // SPEC §3.4: 10px top level, 24px for children. Collapsed, a uniform 9px inset turns the row
    // into a 40px square with the glyph centred — and leaves the glyph within 1px of where it sits
    // in the open rail, so nothing visibly jumps when the state flips.
    paddingLeft: collapsed ? COLLAPSED_INSET : 10 + depth * 14,
    paddingRight: collapsed ? COLLAPSED_INSET : 10,
    paddingTop: collapsed ? COLLAPSED_INSET : 8,
    paddingBottom: collapsed ? COLLAPSED_INSET : 8,
    background: active ? 'var(--sm-surface-3)' : 'transparent',
    color: active ? 'var(--sm-ink)' : 'var(--sm-ink-2)',
    fontWeight: active ? 500 : 300,
    transition: `background .16s, color .16s, padding ${SLIDE}`,
  } as const;

  // `justify-between` is kept in both states rather than switching to `center` when collapsed:
  // with the chevron gone the row has a single child, so it already sits flush left, and there is
  // no re-centring for the browser to animate away from.
  const rowClass =
    'w-full flex items-center justify-between rounded-[8px] cursor-pointer select-none border-0 font-[inherit] text-left hover:bg-[var(--sm-surface-3)] hover:text-[var(--sm-ink)]';

  const body = (
    <>
      <span
        className="flex items-center min-w-0"
        style={{ gap: collapsed ? 0 : 8, transition: `gap ${SLIDE}` }}
      >
        <NavGlyph icon={item.icon} active={active} collapsed={collapsed} />
        <RailLabel collapsed={collapsed} className="text-[15px] text-ellipsis">
          {item.label}
        </RailLabel>
      </span>
      {item.children && !collapsed && (
        <span
          className={`${MATERIAL} flex-none text-[17px] text-[var(--sm-ink-3)] transition-transform duration-200`}
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          chevron_right
        </span>
      )}
    </>
  );

  // A real route renders as a link so it can be opened in a new tab, middle-clicked and crawled.
  if (item.href) {
    return (
      <Link href={item.href} className={rowClass} style={rowStyle} onClick={() => onSelect(item.id)} {...tip}>
        {body}
      </Link>
    );
  }

  const handleClick = () => {
    if (item.action === 'search') return onSearch();
    if (item.children) return onToggle(item.id);
    // TODO: no route yet — /chat and /integrations, and the Meetings filters, are not built.
    onSelect(item.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={rowClass}
      style={rowStyle}
      {...(item.children ? { 'aria-expanded': expanded } : {})}
      {...tip}
    >
      {body}
    </button>
  );
}

/**
 * The design's card reads "Basic · 1.4 / 4.0 h · 35% · 2.6 h left this month". Those are
 * prototype strings; the shell already fetches the real usage and subscription, so the card
 * renders live numbers in that exact layout. Hard-coding the design's figures into a shipped
 * app would be a bug rather than a pixel match.
 *
 * Collapsed, the same numbers drive a 30px ring inside a 40×40 button — the card's text and its
 * Upgrade button have nowhere to go in a 64px rail, but the link to /pricing has to survive.
 */
function UsageCard({
  usage,
  subscription,
  collapsed,
  tipProps,
}: {
  usage: UsageSummary | null;
  subscription: SubscriptionSummary | null;
  collapsed: boolean;
  tipProps: (label: string) => TipProps;
}) {
  // Absent a subscription the account is on the free tier, which is what the API reports too.
  const planId = subscription?.plan ?? 'free';
  const planName = PLANS.find((plan) => plan.id === planId)?.name ?? 'Free';

  const used = usage ? usage.secondsUsed / 3600 : null;
  const cap = usage && usage.secondsCap > 0 ? usage.secondsCap / 3600 : null;
  const percent = used !== null && cap !== null ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0;
  const remaining = used !== null && cap !== null ? Math.max(0, cap - used) : null;

  if (collapsed) {
    // Ring geometry lifted from the handoff's reference/icons.tsx ProgressRing: r=17 in a 40 box,
    // 3.5 stroke, rotated -90° so the arc starts at twelve o'clock.
    const circumference = 2 * Math.PI * 17;
    const arc = (circumference * percent) / 100;
    const summary =
      used !== null && cap !== null
        ? `${planName} · ${used.toFixed(1)} / ${cap.toFixed(1)} h · Upgrade`
        : `${planName} · Upgrade`;

    return (
      <Link
        href="/pricing"
        aria-label={summary}
        className="self-center grid place-items-center rounded-[10px] transition-[background] duration-[180ms] hover:bg-[var(--sm-surface-2)]"
        style={{ width: GLYPH + COLLAPSED_INSET * 2, height: GLYPH + COLLAPSED_INSET * 2 }}
        {...tipProps(summary)}
      >
        <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="20" cy="20" r="17" fill="none" stroke="var(--sm-surface-3)" strokeWidth="3.5" />
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke="var(--sm-accent)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${arc.toFixed(1)} ${circumference.toFixed(1)}`}
          />
        </svg>
      </Link>
    );
  }

  return (
    <section className={FOOTER_CARD}>
      <div className="flex items-baseline justify-between gap-[8px]">
        <span className="text-[13px] font-bold text-[var(--sm-ink)]">{planName}</span>
        <span className="text-[11px] text-[var(--sm-ink-3)] tabular-nums">
          {used !== null && cap !== null ? `${used.toFixed(1)} / ${cap.toFixed(1)} h` : '— / — h'}
        </span>
      </div>
      <div
        className="mt-[9px] mb-[6px] h-[6px] rounded-[999px] overflow-hidden"
        style={{ background: 'var(--sm-surface-3)' }}
      >
        <div
          className="h-[6px] rounded-[999px]"
          style={{ width: `${percent}%`, background: 'var(--sm-accent)' }}
        />
      </div>
      <p className="mt-0 mb-[11px] text-[11.5px] text-[var(--sm-ink-3)]">
        {remaining !== null ? `${remaining.toFixed(1)} h left this month` : 'Checking your usage…'}
      </p>
      <Link
        href="/pricing"
        className="block w-full text-center rounded-[9px] py-[9px] text-[13px] font-semibold cursor-pointer transition-opacity duration-[180ms] hover:opacity-90"
        style={{ background: 'var(--sm-invert-bg)', color: 'var(--sm-invert-fg)' }}
      >
        Upgrade plan
      </Link>
    </section>
  );
}
