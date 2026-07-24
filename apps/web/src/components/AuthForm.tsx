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

/** Shared card for /login and /signup — matches the landing page's light design language. */
export default function AuthForm(props: Props) {
  return (
    <main className="min-h-screen bg-transparent text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-slate-900/5 text-slate-900 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider mb-4 border border-slate-900/10">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              summarize
            </span>
            MeetingAI
          </div>
          <h1 className="font-headline-lg text-3xl font-bold tracking-tight text-slate-900 mb-2">{props.title}</h1>
          <p className="text-on-surface-variant text-sm">{props.subtitle}</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 shadow-sm">
          <form onSubmit={props.onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={props.email}
                onChange={(e) => props.onEmail(e.target.value)}
                disabled={props.loading}
                placeholder="you@company.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                autoComplete={props.passwordAutoComplete ?? 'current-password'}
                value={props.password}
                onChange={(e) => props.onPassword(e.target.value)}
                disabled={props.loading}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50"
              />
              {props.passwordHint && <p className="text-[12px] text-slate-400 mt-1.5">{props.passwordHint}</p>}
            </div>

            {props.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-lg text-sm text-center font-medium">
                {props.error}
              </div>
            )}

            <button
              type="submit"
              disabled={props.loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg py-3 font-semibold text-sm transition-colors active:scale-[0.99] shadow-sm cursor-pointer flex items-center justify-center gap-2"
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

        <p className="text-center text-on-surface-variant text-sm mt-6">{props.footer}</p>
      </div>
    </main>
  );
}
