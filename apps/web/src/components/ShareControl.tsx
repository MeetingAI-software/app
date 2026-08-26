'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rotateShare, setShare, type Meeting } from '@/lib/api';

/**
 * The share panel for a finished meeting.
 *
 * Sharing is OFF for meetings created after the toggle shipped, so the primary action here is
 * turning it on. Two separate controls on purpose:
 *
 *   - the switch parks the link and keeps the token, so flipping it back restores the URL people
 *     already have;
 *   - "Reset link" throws the token away, which is the only useful answer once a link has leaked.
 *
 * Collapsing them into one control would mean you cannot pause sharing without breaking every
 * bookmark. Reset asks for a second click rather than a browser confirm(), because it is
 * irreversible and a native dialog here reads as a bug.
 */
export default function ShareControl({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange: (patch: { shareToken: string; shareEnabled: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const shareUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/s/${meeting.shareToken}`;

  /**
   * Every close goes through here, so a half-finished reset can never survive to the next open —
   * re-opening the panel already primed to destroy the link would be a nasty surprise.
   */
  const closePanel = useCallback(() => {
    setOpen(false);
    setConfirmingReset(false);
    setError(null);
  }, []);

  // A popover with no way out is worse than no popover.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closePanel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closePanel]);

  const run = useCallback(
    async (action: () => Promise<{ shareToken: string; shareEnabled: boolean }>) => {
      setBusy(true);
      setError(null);
      try {
        onChange(await action());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const handleToggle = () => run(() => setShare(meeting.id, !meeting.shareEnabled));

  const handleReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    void run(() => rotateShare(meeting.id));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => (open ? closePanel() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="px-4 py-2 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
      >
        Share
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${meeting.shareEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Share settings"
          className="absolute right-0 top-full mt-2 w-[340px] bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-20 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Anyone with the link</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {meeting.shareEnabled
                  ? 'Can read the summary, document and transcript.'
                  : 'Sharing is off. The link returns “not found”.'}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={meeting.shareEnabled}
              aria-label="Share this meeting"
              disabled={busy}
              onClick={handleToggle}
              className={`shrink-0 mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 cursor-pointer ${
                meeting.shareEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  meeting.shareEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {meeting.shareEnabled && (
            <>
              <div className="mt-4 flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Share link"
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono focus:outline-none focus:border-slate-400"
                />
                <button
                  onClick={handleCopy}
                  className="shrink-0 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className={`text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                    confirmingReset ? 'text-red-600 hover:text-red-700' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {confirmingReset ? 'Reset link — this breaks the old one. Click again.' : 'Reset link'}
                </button>
                <p className="text-[11px] text-slate-400 mt-1">
                  Creates a new link and stops the old one working. Use this if a link went somewhere
                  it should not have.
                </p>
              </div>
            </>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-600 font-medium" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
