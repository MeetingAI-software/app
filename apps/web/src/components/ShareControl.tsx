'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rotateShare, setShare, type Meeting, type ShareState } from '@/lib/api';

/** Owner-controlled, expiring links. Re-enabling always creates a new link. */
export default function ShareControl({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange: (patch: ShareState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);
  const shareActive = Boolean(now && meeting.shareEnabled && meeting.shareExpiresAt
    && new Date(meeting.shareExpiresAt).getTime() > now);

  const shareUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/s/${meeting.shareToken}`;

  /**
   * Every close goes through here, so a half-finished reset can never survive to the next open —
   * re-opening the panel already primed to destroy the link would be a nasty surprise. Note that
   * closing is not the only way to leave the reset button armed; `run` disarms too, for the paths
   * that never close the panel at all.
   */
  const closePanel = useCallback(() => {
    setOpen(false);
    setConfirmingReset(false);
    setError(null);
    setCopied(false);
  }, []);

  /**
   * Opening clears too, not just closing. closePanel runs synchronously, but a request already in
   * flight resolves afterwards and writes its failure into a panel nobody is looking at — which
   * then surfaces, unexplained and attached to nothing, the next time Share is clicked.
   */
  const openPanel = useCallback(() => {
    setError(null);
    setConfirmingReset(false);
    setOpen(true);
  }, []);

  // Nothing should still be counting down once this unmounts.
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  // A popover with no way out is worse than no popover.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closePanel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closePanel();
      // The panel is gone; without this the focus ring goes with it and the next Tab restarts from
      // the top of the document. A pointer close is left alone — the user is already somewhere else.
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closePanel]);

  const run = useCallback(
    async (action: () => Promise<ShareState>) => {
      setBusy(true);
      setError(null);
      // Any action against the link disarms the reset gate and retires the "Copied ✓" flash.
      // Switching sharing off unmounts the reset button but not its state, so without this it
      // comes back still armed when sharing is switched on again and the next single click
      // destroys a link the owner has only just restored. The flash goes for the same reason:
      // after a rotate it would be vouching for a URL that no longer works.
      setConfirmingReset(false);
      setCopied(false);
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

  const handleToggle = () => run(() => setShare(meeting.id, !shareActive));

  const handleReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    void run(() => rotateShare(meeting.id));   // run() does the disarming
  };

  const handleCopy = async () => {
    if (busy || !shareActive) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      // Restart the countdown rather than stacking one per click, or a second copy flips the label
      // back while the first timer is still running.
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? closePanel() : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="px-4 py-2 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
      >
        Share
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${shareActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
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
                {shareActive
                  ? 'Can read the summary, document and transcript until the link expires.'
                  : 'Sharing is off or expired. Enabling creates a new 24-hour link.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shareActive}
              aria-label="Share this meeting"
              disabled={busy}
              onClick={handleToggle}
              className={`shrink-0 mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 cursor-pointer ${
                shareActive ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  shareActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {shareActive && (
            <>
              <p className="mt-3 text-xs text-slate-500">Expires {new Date(meeting.shareExpiresAt!).toLocaleString()}</p>
              <div className="mt-4 flex gap-2">
                <input
                  readOnly
                  disabled={busy}
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Share link"
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono focus:outline-none focus:border-slate-400 disabled:opacity-50"
                />
                {/* Both go dead while a write is in flight: mid-rotate this box still shows the
                    outgoing token, and a copy landing then hands someone a link about to 404. */}
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={busy}
                  className="shrink-0 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
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
