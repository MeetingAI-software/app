/* Syncmemos — the custom SVGs, copied VERBATIM from the design handoff bundle
 * (reference/icons.tsx). Everything else in the design is Material Symbols Outlined.
 *
 * Home and AI Chat come from the icons/ handoff folder (home.svg, ai-chat.svg) and are
 * transcribed path-for-path; both are plain currentColor stroke icons.
 *
 * The handoff also ships ProgressRing and ThumbPlaceholder; both belong to the memo feed,
 * which is not built yet, so they are not ported here.
 */

/* 1. Brand monogram — six rounded bars: three vertical (waveform) + three horizontal (text).
 *    Sits in the account row at 17px inside a 32px #18181B tile; also the app favicon source.
 *    Inherits colour via `fill: currentColor`.
 */
export function SyncmemosMark({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ fill: 'currentColor' }}>
      <rect x="10" y="21" width="9" height="58" rx="4.5" />
      <rect x="25" y="11" width="9" height="78" rx="4.5" />
      <rect x="40" y="30" width="9" height="40" rx="4.5" />
      <rect x="58" y="27" width="32" height="9" rx="4.5" />
      <rect x="58" y="45.5" width="26" height="9" rx="4.5" />
      <rect x="58" y="64" width="20" height="9" rx="4.5" />
    </svg>
  );
}

/* 2. Home — line-art house (roof, walls, door), from the icons handoff (icons/home.svg).
 *    Rendered at 23px in a 23px box. Stroke follows the nav item's colour.
 */
export function HomeIcon({ size = 23 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M3 12 12 4 21 12" />
      <path d="M5 11v9.5h14V11" />
      <path d="M10 20.5v-6h4v6" />
    </svg>
  );
}

/* 3. AI Chat — line-art robot head with antennae and a speech bubble, from the icons
 *    handoff (icons/ai-chat.svg). Unlike the planet it replaced, this one is a plain
 *    stroke icon: it inherits the nav item's colour and needs no keyframes.
 */
export function AiChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M7.5 6.7h9a4.3 4.3 0 0 1 4.3 4.3v3.7a4.3 4.3 0 0 1-4.3 4.3h-9A4.3 4.3 0 0 1 3.2 14.7V11a4.3 4.3 0 0 1 4.3-4.3Z" />
      <path d="M8.6 6.7 6.9 4.4" />
      <path d="M15.4 6.7 17.1 4.4" />
      <circle cx="6.2" cy="3.4" r="1.05" />
      <circle cx="17.8" cy="3.4" r="1.05" />
      <path d="M8.6 9.3h6.8a2.2 2.2 0 0 1 2.2 2.2v1.4a2.2 2.2 0 0 1-2.2 2.2l.3 1.8-2.1-1.8H8.6a2.2 2.2 0 0 1-2.2-2.2v-1.4a2.2 2.2 0 0 1 2.2-2.2Z" />
      <circle cx="9.6" cy="12.2" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.2" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="12.2" r="0.95" fill="currentColor" stroke="none" />
      <path d="M8.4 21.2h7.2" />
    </svg>
  );
}
