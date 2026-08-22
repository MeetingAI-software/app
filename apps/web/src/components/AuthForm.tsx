'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { googleOAuthUrl } from '@/lib/api';
import { BRAND_NAME } from '@/lib/brand';
import { PublicFooter } from '@/components/PublicFooter';

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
      <div className="font-body-md text-on-surface bg-[#f9f9f9] min-h-screen flex flex-col justify-between selection:bg-slate-200">
        
        {/* TopNavBar — Fixed Header */}
        <header className="bg-surface-container-lowest/80 backdrop-blur-md font-body-md text-body-md fixed top-0 w-full z-50 border-b border-slate-200 shadow-sm content-layer">
          <div className="flex justify-between items-center px-margin-page py-4 max-w-container-max mx-auto">
            <Link href="/" className="font-headline-md text-headline-md font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                summarize
              </span>
              {BRAND_NAME}
            </Link>
            <nav className="hidden md:flex items-center gap-gutter">
              <Link href="/#features" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Features</Link>
              <Link href="/pricing" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Pricing</Link>
              <Link href="/#demo" className="text-on-surface-variant hover:text-secondary transition-colors duration-200 font-medium">Demo</Link>
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

        {/* Full-bleed Split Screen Layout (No top padding, background goes directly behind header to very top) */}
        <main className="flex-1 flex w-full">
          <div className="flex w-full flex-1 flex-col lg:flex-row min-h-screen">
            
            {/* Left Pane: Branding & Hero Content (Stretches all the way up to top of screen behind header) */}
            <div className="hidden lg:flex lg:w-1/2 bg-slate-50 border-r border-slate-200 flex-col pt-32 pb-16 px-12 xl:px-16 relative overflow-hidden justify-center">
              <div className="absolute top-0 left-0 w-1 h-full bg-slate-900 opacity-10" />
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right bottom, rgb(248, 250, 252), rgb(241, 245, 249))', opacity: 1 }} />

              <div className="relative z-10 my-auto max-w-lg space-y-6 text-left">
                <h2 className="font-headline-lg text-4xl xl:text-5xl text-slate-900 tracking-tight leading-tight font-bold">
                  Turn hour-long meetings into 90-second catch-ups.
                </h2>
                <p className="font-body-lg text-on-surface-variant leading-relaxed text-lg">
                  Precision diarization and AI-driven summaries keep your team aligned without the recording fatigue.
                </p>
                <div className="pt-4">
                  <Link
                    href="/#features"
                    className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3.5 rounded font-label-mono text-xs uppercase tracking-wider font-semibold hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-sm group"
                  >
                    Explore Features
                    <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Pane: Form (Stretches all the way up to top of screen behind header) */}
            <div className="w-full lg:w-1/2 flex items-center justify-center pt-32 pb-16 px-8 sm:px-12 xl:px-16 bg-surface-container-lowest">
              <div className="w-full max-w-md space-y-6">
                
                {/* Header */}
                <div className="text-center lg:text-left space-y-2">
                  <h1 className="font-headline-lg text-3xl md:text-4xl text-slate-900 tracking-tight font-bold">
                    {props.title}
                  </h1>
                  <p className="font-body-md text-on-surface-variant">
                    {props.subtitle}
                  </p>
                </div>

                {/* Form */}
                <form className="space-y-4 text-left" onSubmit={props.onSubmit}>
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <label className="block font-label-mono text-xs uppercase tracking-wider font-semibold text-on-surface" htmlFor="email">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                      value={props.email}
                      onChange={(e) => props.onEmail(e.target.value)}
                      disabled={props.loading}
                      placeholder="name@company.com"
                      className="w-full bg-surface-bright border border-slate-200 rounded px-4 py-3 font-body-md text-on-surface placeholder:text-outline-variant shadow-xs transition-colors focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 disabled:opacity-50"
                    />
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block font-label-mono text-xs uppercase tracking-wider font-semibold text-on-surface" htmlFor="password">
                        Password
                      </label>
                      {props.mode === 'login' && (
                        <a href="#" className="font-label-mono text-xs text-secondary hover:text-slate-900 transition-colors font-medium">
                          Forgot password?
                        </a>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete={props.passwordAutoComplete ?? 'current-password'}
                        value={props.password}
                        onChange={(e) => props.onPassword(e.target.value)}
                        disabled={props.loading}
                        placeholder="••••••••"
                        className="w-full bg-surface-bright border border-slate-200 rounded px-4 py-3 pr-12 font-body-md text-on-surface placeholder:text-outline-variant shadow-xs transition-colors focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 disabled:opacity-50"
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
                      <p className="text-[12px] text-slate-400 mt-1">{props.passwordHint}</p>
                    )}
                  </div>

                  {props.error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm text-center font-medium">
                      {props.error}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={props.loading}
                    className="w-full bg-slate-900 text-white font-label-mono text-xs uppercase tracking-wider font-bold py-3.5 px-6 rounded transition-all hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 mt-2 flex justify-center items-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {props.loading ? (
                      'Processing...'
                    ) : (
                      <>
                        {props.cta}
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-200" />
                  <span className="flex-shrink-0 mx-4 font-label-mono text-xs text-outline-variant uppercase">OR</span>
                  <div className="flex-grow border-t border-slate-200" />
                </div>

                {/* Social Login Button */}
                <a
                  href={googleOAuthUrl()}
                  className="w-full bg-surface-container-lowest border border-slate-200 text-slate-900 font-label-mono text-xs uppercase tracking-wider font-semibold py-3 px-6 rounded transition-all hover:bg-slate-50 flex justify-center items-center gap-3 shadow-xs cursor-pointer no-underline"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </a>

                {/* Footer Text */}
                <p className="text-center font-body-md text-sm text-on-surface-variant pt-2">
                  {props.footer}
                </p>
              </div>
            </div>
          </div>
        </main>

        <PublicFooter compact />
      </div>
    </>
  );
}
