/**
 * The console rail's navigation tree (SPEC §3.4).
 *
 * Shaped after the prototype's `GROUPS` const so the memo feed and the ⌘K palette can read the
 * same source when they land. Items carry either an `href` (real route) or nothing at all —
 * a missing href means the item renders exactly as designed but does not navigate, which is the
 * agreed treatment for the pages that do not exist yet.
 *
 * Not present: the FOLDERS section. It is in the design, but there is no folders API and the
 * section was cut from this pass by the design owner — see the handoff's open question 2.
 */

export type NavIcon =
  | { kind: 'material'; glyph: string }
  | { kind: 'svg'; name: 'home' | 'aichat' };

export interface NavItem {
  id: string;
  label: string;
  icon: NavIcon;
  /** Omitted for items with no route yet; those render but do not navigate. */
  href?: string;
  /** A parent item toggles its children and never navigates (SPEC §8). */
  children?: NavItem[];
  /** `search` opens the ⌘K palette, which is not built yet. */
  action?: 'search';
}

const material = (glyph: string): NavIcon => ({ kind: 'material', glyph });

export const NAV_ITEMS: NavItem[] = [
  { id: 'search', label: 'Search', icon: material('search'), action: 'search' },
  { id: 'home', label: 'Home', icon: { kind: 'svg', name: 'home' }, href: '/meetings' },
  { id: 'aichat', label: 'AI Chat', icon: { kind: 'svg', name: 'aichat' } },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: material('graphic_eq'),
    children: [
      { id: 'm-all', label: 'All meetings', icon: material('tag') },
      { id: 'm-online', label: 'Online', icon: material('tag') },
      { id: 'm-room', label: 'In room', icon: material('tag') },
    ],
  },
  { id: 'integrations', label: 'Integrations', icon: material('dashboard_customize') },
];

/** Groups that start expanded (SPEC §3.4: Meetings is open by default). */
export const DEFAULT_EXPANDED: Record<string, boolean> = { meetings: true };

/**
 * SPEC §3.4: "Default active item: Home." The prototype always has exactly one active row —
 * `activeId` starts here and only ever moves to another item — so this is also the fallback for
 * any route the rail does not itself link to.
 */
export const DEFAULT_ACTIVE_ID = 'home';

/**
 * Flattened id → href, for reconciling the active item against the current pathname.
 */
export const NAV_HREFS: Record<string, string> = {};
for (const item of NAV_ITEMS) {
  if (item.href) NAV_HREFS[item.id] = item.href;
  for (const child of item.children ?? []) {
    if (child.href) NAV_HREFS[child.id] = child.href;
  }
}
