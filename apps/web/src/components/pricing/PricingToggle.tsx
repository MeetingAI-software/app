'use client';

import React from 'react';

interface PricingToggleProps {
  isAnnual: boolean;
  onChange: (annual: boolean) => void;
}

export function PricingToggle({ isAnnual, onChange }: PricingToggleProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 my-8">
      <div className="inline-flex items-center p-1.5 bg-slate-100 rounded-full border border-slate-200">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
            !isAnnual
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Monthly billing
        </button>

        <button
          type="button"
          onClick={() => onChange(true)}
          className={`relative px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 flex items-center gap-2 ${
            isAnnual
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Annual billing</span>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            Save 20%
          </span>
        </button>
      </div>

      <div
        className={`h-5 text-xs text-slate-500 transition-opacity duration-300 ${
          isAnnual ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Billed annually • Save 20% with annual commitment
      </div>
    </div>
  );
}
