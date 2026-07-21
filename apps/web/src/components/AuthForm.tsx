'use client';

import React from 'react';

interface Props {
  title: string;
  subtitle: string;
  cta: string;
  loading: boolean;
  error: string | null;
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  passwordAutoComplete?: string;
  passwordHint?: string;
  footer: React.ReactNode;
}

/** Shared card for /login and /signup — reuses the old AdminGate visual language. */
export default function AuthForm(props: Props) {
  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-indigo-500/10 text-indigo-400 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider mb-3 border border-indigo-500/20">
            MeetingAI
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">{props.title}</h1>
          <p className="text-gray-400 text-sm">{props.subtitle}</p>
        </div>

        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={props.onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={props.email}
                onChange={(e) => props.onEmail(e.target.value)}
                disabled={props.loading}
                placeholder="you@company.com"
                className="w-full bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                autoComplete={props.passwordAutoComplete ?? 'current-password'}
                value={props.password}
                onChange={(e) => props.onPassword(e.target.value)}
                disabled={props.loading}
                placeholder="••••••••"
                className="w-full bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
              />
              {props.passwordHint && <p className="text-[11px] text-gray-600 mt-1.5">{props.passwordHint}</p>}
            </div>

            {props.error && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3.5 rounded-xl text-xs text-center font-medium">
                {props.error}
              </div>
            )}

            <button
              type="submit"
              disabled={props.loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-xl py-3 font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {props.loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Please wait…
                </>
              ) : (
                props.cta
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">{props.footer}</p>
      </div>
    </main>
  );
}
