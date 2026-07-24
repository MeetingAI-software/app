'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface Props {
  mode: 'signup' | 'login';
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

/** 
 * Shared card for /login and /signup — 100% IDENTICAL design system match to page.tsx:
 * Uses identical navbar layout, font hierarchy (font-headline-md), Material Symbols icons,
 * identical button styles (magnetic-btn, btn-shimmer, bg-slate-900), and identical background tokens.
 */
export default function AuthForm(props: Props) {
  const [showPassword, setShowPassword] = useState(false);

  const handleMagneticMouseMove = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
    btn.style.transition = 'transform 0.1s ease-out';
  };

  const handleMagneticMouseLeave = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    const btn = e.currentTarget;
    btn.style.transform = 'translate(0px, 0px)';
    btn.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      <link href="https://fonts.googleapis.com" rel="preconnect"/>
      <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <div className="font-body-md text-body-md bg-transparent min-h-screen relative overflow-x-hidden selection:bg-slate-200 flex flex-col justify-between">
        
        {/* TopNavBar — EXACT MATCH to landing page (page.tsx) */}
        <header className="bg-surface-container-lowest/80 backdrop-blur-md font-body-md text-body-md fixed top-0 w-full z-50 border-b border-slate-200 shadow-sm content-layer">
          <div className="flex justify-between items-center px-margin-page py-4 max-w-container-max mx-auto">
            <Link href="/" className="font-headline-md text-headline-md font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                summarize
              </span>
              MeetingAI
            </Link>
            <nav className="hidden md:flex items-center gap-gutter">
              <Link href="/#features" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Features</Link>
              <Link href="/pricing" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Pricing</Link>
              <Link href="/#demo" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium font-body-md">Demo</Link>
            </nav>
            <div className="flex items-center gap-4">
              <Link
                href={props.mode === 'signup' ? '/login' : '/signup'}
                className="hidden sm:inline-block text-slate-900 font-medium hover:text-secondary transition-colors duration-200"
              >
                {props.mode === 'signup' ? 'Sign In' : 'Sign Up'}
              </Link>
              <Link
                href={props.mode === 'signup' ? '/signup' : '/login'}
                className="magnetic-btn btn-shimmer bg-slate-900 text-white px-6 py-2 rounded font-medium hover:bg-slate-800 transition-colors shadow-sm text-sm"
                onMouseMove={handleMagneticMouseMove}
                onMouseLeave={handleMagneticMouseLeave}
              >
                {props.mode === 'signup' ? 'Get Started' : 'Log In'}
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="pt-[140px] pb-16 px-margin-page max-w-container-max mx-auto w-full flex-1 flex flex-col items-center justify-center relative z-10">
          
          {/* MeetingAI Badge — EXACT MATCH to landing page badge */}
          <div className="inline-block bg-slate-900/5 text-slate-900 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border border-slate-900/10 mb-6">
            MeetingAI
          </div>

          {/* Title & Subtitle — EXACT MATCH to landing page typography */}
          <div className="text-center max-w-xl mx-auto mb-stack-lg">
            <h1 className="font-headline-md text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-3 leading-tight">
              {props.title}
            </h1>
            <p className="text-on-surface-variant text-base leading-relaxed">
              {props.subtitle}
            </p>
          </div>

          {/* Form Card — EXACT MATCH to landing page cards */}
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
            <form onSubmit={props.onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={props.email}
                  onChange={(e) => props.onEmail(e.target.value)}
                  disabled={props.loading}
                  placeholder="you@company.com"
                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={props.passwordAutoComplete ?? 'current-password'}
                    value={props.password}
                    onChange={(e) => props.onPassword(e.target.value)}
                    disabled={props.loading}
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-medium transition-colors"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {props.passwordHint && (
                  <p className="text-[12px] text-slate-400 mt-1.5">{props.passwordHint}</p>
                )}
              </div>

              {props.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-lg text-sm text-center font-medium">
                  {props.error}
                </div>
              )}

              {/* Primary Action Button — EXACT MATCH to landing page buttons */}
              <button
                type="submit"
                disabled={props.loading}
                className="w-full magnetic-btn btn-shimmer bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg py-3 font-semibold text-sm transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
                onMouseMove={handleMagneticMouseMove}
                onMouseLeave={handleMagneticMouseLeave}
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

            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <p className="text-xs text-on-surface-variant font-medium">{props.footer}</p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full max-w-container-max mx-auto px-margin-page py-6 text-center text-xs text-on-surface-variant font-medium">
          © {new Date().getFullYear()} MeetingAI Inc. All rights reserved.
        </footer>
      </div>
    </>
  );
}
