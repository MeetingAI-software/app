import React from 'react';

/**
 * The brand mark used in every top navigation bar. Kept in one place so the
 * landing, auth and pricing headers can never drift apart again.
 */
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/nota-mark-black.svg"
      alt="Syncmemos logo"
      width={28}
      height={28}
      className={className}
    />
  );
}
