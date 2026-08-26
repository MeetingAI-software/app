'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { COMING_SOON_COPY, type ComingSoonVariant } from '@/lib/launch';
import { BRAND_NAME, SUPPORT_EMAIL } from '@/lib/brand';
import { LogoMark } from '@/components/Logo';

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
          style={{ background: 'linear-gradient(90deg, #a5b4fc 0%, #d8b4fe 55%, #eebef2 100%)' }}
        />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
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

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} launch`)}`}
              className="rounded-xl border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              Notify me at launch
            </a>
            <button
              ref={dismissRef}
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
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
