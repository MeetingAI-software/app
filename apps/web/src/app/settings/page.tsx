'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { deleteAccount, ApiError } from '@/lib/api';

export default function SettingsPage() {
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
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-8">Manage your account.</p>

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

      <div className="mt-6">
        <Link href="/meetings" className="text-gray-500 hover:text-gray-300 text-sm">
          ← Back to meetings
        </Link>
      </div>
    </div>
  );
}
