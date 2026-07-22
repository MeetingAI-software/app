'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { changePassword, changeEmail, deleteAccount, ApiError } from '@/lib/api';

const CARD = 'bg-[#13171c] border border-gray-800 rounded-2xl p-6';
const INPUT =
  'w-full bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50';
const LABEL = 'block text-xs text-gray-400 mb-1.5';

export default function SettingsPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-gray-500 text-sm">Manage your account.</p>
      </div>

      <ChangePasswordCard />
      <ChangeEmailCard />
      <DeleteAccountCard />

      <div>
        <Link href="/meetings" className="text-gray-500 hover:text-gray-300 text-sm">
          ← Back to meetings
        </Link>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect current password.'
          : err instanceof ApiError && err.status === 400
            ? 'New password must be at least 10 characters.'
            : err instanceof Error
              ? err.message
              : 'Could not change password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className="text-white font-semibold mb-1">Change password</h2>
      <p className="text-gray-500 text-sm mb-4">Changing your password signs out your other devices.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={LABEL}>Current password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="••••••••"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>New password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="At least 10 characters"
            className={INPUT}
          />
        </div>
        {error && <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3 rounded-xl text-xs">{error}</div>}
        {done && <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 p-3 rounded-xl text-xs">Password updated.</div>}
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
        >
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

function ChangeEmailCard() {
  const [current, setCurrent] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      await changeEmail(current, email);
      setCurrent('');
      setEmail('');
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect password.'
          : err instanceof ApiError && err.status === 409
            ? 'That email is already in use.'
            : err instanceof Error
              ? err.message
              : 'Could not change email.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className="text-white font-semibold mb-1">Change email</h2>
      <p className="text-gray-500 text-sm mb-4">You'll sign in with the new email next time.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={LABEL}>New email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="you@company.com"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Confirm your password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="••••••••"
            className={INPUT}
          />
        </div>
        {error && <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3 rounded-xl text-xs">{error}</div>}
        {done && <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 p-3 rounded-xl text-xs">Email updated. Reload to see it in the header.</div>}
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
        >
          {loading ? 'Saving…' : 'Update email'}
        </button>
      </form>
    </div>
  );
}

function DeleteAccountCard() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await deleteAccount(password);
      router.replace('/login'); // cookie already cleared server-side
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect password.'
          : err instanceof Error
            ? err.message
            : 'Could not delete account.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#13171c] border border-red-900/40 rounded-2xl p-6">
      <h2 className="text-red-300 font-semibold mb-1">Delete account</h2>
      <p className="text-gray-400 text-sm mb-4">
        Deletes every meeting, document, transcript and recording you own. Your share links stop working.{' '}
        <strong className="text-gray-300">This cannot be undone.</strong>
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="bg-red-600/90 hover:bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
        >
          Delete my account…
        </button>
      ) : (
        <form onSubmit={onDelete} className="space-y-3">
          <label className="block text-xs text-gray-400">Confirm your password to continue</label>
          <input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder="••••••••"
            className="w-full bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-red-500 transition-colors disabled:opacity-50"
          />
          {error && (
            <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3 rounded-xl text-xs">{error}</div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
            >
              {loading ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setError(null);
                setPassword('');
              }}
              disabled={loading}
              className="text-gray-400 hover:text-white text-sm px-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
