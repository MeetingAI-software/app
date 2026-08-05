'use client';

import { useEffect, useState } from 'react';
import { ApiError, changeEmail, resendVerification, type User } from '../lib/api';
import {
  RESEND_COOLDOWN_MS,
  verificationBannerButtonLabel,
  type VerificationBannerStatus,
} from '../lib/email-verification';

/**
 * The holding screen an unverified account sees instead of the app. The API gates every route
 * behind email verification, so there is nothing useful behind this page — the three actions here
 * (resend, correct the address, leave) are exactly the ones the server still accepts.
 */
export default function VerificationRequired({
  user,
  onLogout,
  onEmailChanged,
}: {
  user: Pick<User, 'email'>;
  onLogout: () => void;
  onEmailChanged: (user: User) => void;
}) {
  const [status, setStatus] = useState<VerificationBannerStatus>('idle');
  const [editing, setEditing] = useState(false);

  // Re-arm the button once the server-side cooldown has elapsed. Without this the page is stuck on
  // "Email sent" until it unmounts, so a link that never arrives can't be re-requested.
  useEffect(() => {
    if (status !== 'sent' && status !== 'rate-limited') return;
    const timer = setTimeout(() => setStatus('idle'), RESEND_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const handleResend = async () => {
    if (status === 'sending' || status === 'sent' || status === 'rate-limited') return;
    setStatus('sending');
    try {
      await resendVerification(user.email);
      setStatus('sent');
    } catch (err) {
      setStatus(err instanceof ApiError && err.status === 429 ? 'rate-limited' : 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center p-4">
      <header className="w-full max-w-container-max py-4">
        <span className="font-headline-md text-xl font-bold text-slate-900 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nota-mark-black.svg" alt="Syncmemos logo" width={28} height={28} className="h-7 w-7" />
          Syncmemos
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center w-full py-8">
        <section
          aria-label="Email verification required"
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">mark_email_unread</span>
          </div>

          <h1 className="font-headline-md text-2xl font-bold text-slate-900">Check your email</h1>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">
            We sent a verification link to <strong className="text-slate-900">{user.email}</strong>.
            The link expires after 24 hours. Open it and this page will unlock.
          </p>

          <p className="mt-3 min-h-5 text-sm text-on-surface-variant" aria-live="polite">
            {status === 'sent' && 'A new verification email has been sent.'}
            {status === 'rate-limited' && 'Too many requests. Wait a minute before trying again.'}
            {status === 'error' && 'We could not send the email. Please try again.'}
          </p>

          <button
            type="button"
            onClick={handleResend}
            disabled={status === 'sending' || status === 'sent' || status === 'rate-limited'}
            className="mt-3 w-full rounded bg-slate-900 px-6 py-3.5 font-label-mono text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {verificationBannerButtonLabel(status)}
          </button>

          <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
            {editing ? (
              <ChangeEmailForm
                onCancel={() => setEditing(false)}
                onChanged={(updated) => {
                  setEditing(false);
                  setStatus('idle');
                  onEmailChanged(updated);
                }}
              />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <span className="text-on-surface-variant">
                  Wrong address?{' '}
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="font-medium text-slate-900 underline underline-offset-2 hover:text-secondary cursor-pointer"
                  >
                    Change it
                  </button>
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-on-surface-variant underline underline-offset-2 hover:text-secondary cursor-pointer"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * A mistyped address would otherwise be a dead account: no mail arrives, and every route that could
 * fix it is gated. Changing the address re-sends verification to the new one server-side.
 */
function ChangeEmailForm({
  onCancel,
  onChanged,
}: {
  onCancel: () => void;
  onChanged: (user: User) => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { user } = await changeEmail(currentPassword, newEmail);
      onChanged(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the address. Please try again.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
      <label className="text-xs font-medium text-on-surface-variant" htmlFor="verification-new-email">
        New email address
      </label>
      <input
        id="verification-new-email"
        type="email"
        required
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900"
      />

      <label className="text-xs font-medium text-on-surface-variant" htmlFor="verification-password">
        Current password
      </label>
      <input
        id="verification-password"
        type="password"
        required
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900"
      />

      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save and resend'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-900 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
