'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMING_SOON_COPY, type ComingSoonVariant } from '@/lib/launch';
import { BRAND_HIGHLIGHT, BRAND_NAME } from '@/lib/brand';
import { LogoMark } from '@/components/Logo';
import { ApiError, joinWaitlist } from '@/lib/api';

interface ComingSoonDialogProps {
  variant: ComingSoonVariant;
  onClose: () => void;
}

/**
 * Pre-launch notice shown instead of sign-in and checkout. Purely a gate: it never touches the
 * flow it interrupts, so removing the gate restores the original behaviour untouched.
 */
export function ComingSoonDialog({ variant, onClose }: ComingSoonDialogProps) {
  const copy = COMING_SOON_COPY[variant];
  const dismissRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'joined'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    setError(null);
    try {
      await joinWaitlist(email.trim(), variant);
      setStatus('joined');
    } catch (err) {
      // The API's own message is English and written for developers, so the visitor gets ours.
      setStatus('idle');
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Du har försökt några gånger redan. Vänta en stund och försök igen.'
          : 'Något gick fel när vi skulle spara adressen. Försök igen om en liten stund.',
      );
    }
  };

  useEffect(() => {
    dismissRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-soon-title"
        aria-describedby="coming-soon-body"
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200"
      >
        {/* Soft launch-gradient cap, matching the landing hero highlight. */}
        <div
          className="h-1.5 w-full"
          style={{ background: BRAND_HIGHLIGHT }}
        />

        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="absolute right-4 top-5 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <span aria-hidden="true">&#10005;</span>
        </button>

        <div className="p-8">
          <div className="flex items-center gap-2 text-slate-900">
            <LogoMark />
            <span className="text-sm font-bold tracking-tight">{BRAND_NAME}</span>
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            {copy.eyebrow}
          </p>
          <h2 id="coming-soon-title" className="mt-2 text-2xl font-extrabold tracking-tight">
            {copy.title}
          </h2>
          <p id="coming-soon-body" className="mt-3 text-sm leading-relaxed text-slate-600">
            {copy.body}
          </p>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-100">
            {copy.note}
          </div>

          {status === 'joined' ? (
            <p
              role="status"
              className="mt-7 rounded-2xl bg-emerald-50 p-4 text-sm font-medium leading-relaxed text-emerald-800 ring-1 ring-emerald-100"
            >
              Tack! Du står på listan — vi hör av oss så fort {BRAND_NAME} öppnar.
            </p>
          ) : (
            <form onSubmit={handleJoin} className="mt-7">
              <label htmlFor="waitlist-email" className="text-sm font-semibold text-slate-800">
                Vill du veta när vi öppnar?
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="din@epost.se"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-900"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="shrink-0 whitespace-nowrap rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                >
                  {status === 'sending' ? 'Sparar…' : 'Meddela mig'}
                </button>
              </div>
              {error && (
                <p role="alert" className="mt-2 text-sm font-medium text-rose-600">
                  {error}
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Vi sparar bara adressen för att höra av oss vid lanseringen, och du kan säga till
                när som helst om du vill bli borttagen.
              </p>
            </form>
          )}

          <div className="mt-5 flex justify-end">
            <button
              ref={dismissRef}
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              {copy.dismiss}
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
