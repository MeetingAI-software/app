/**
 * The Syncmemos brandmark: three waveform bars resolving into three lines of notes.
 *
 * Inline rather than an <img> so it inherits the surrounding text colour. One component
 * therefore covers the light marketing pages and the dark share page, where an asset
 * would have needed a second black/white file kept in sync by hand.
 *
 * Every call site puts the wordmark directly beside it, so the mark is aria-hidden —
 * otherwise a screen reader announces the brand twice.
 */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="10" y="21" width="9" height="58" rx="4.5" />
      <rect x="25" y="11" width="9" height="78" rx="4.5" />
      <rect x="40" y="30" width="9" height="40" rx="4.5" />
      <rect x="58" y="27" width="32" height="9" rx="4.5" />
      <rect x="58" y="45.5" width="26" height="9" rx="4.5" />
      <rect x="58" y="64" width="20" height="9" rx="4.5" />
    </svg>
  );
}
