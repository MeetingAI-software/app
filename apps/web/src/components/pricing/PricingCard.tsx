'use client';

import React from 'react';
import { PricingPlan, getAnnualTotalEur, getEffectiveMonthlyRateEur } from '@/lib/pricing';

interface PricingCardProps {
  plan: PricingPlan;
  isAnnual: boolean;
}

export function PricingCard({ plan, isAnnual }: PricingCardProps) {
  const isTeam = plan.id === 'team';

  const displayedPrice = isAnnual
    ? getEffectiveMonthlyRateEur(plan.monthlyEur)
    : plan.monthlyEur;

  const annualTotal = getAnnualTotalEur(plan.monthlyEur);

  return (
    <div
      className={`relative flex flex-col justify-between p-6 sm:p-8 rounded-2xl transition-all duration-300 ${
        isTeam
          ? 'bg-slate-900 text-white shadow-2xl ring-2 ring-blue-500 md:-translate-y-2 z-10'
          : 'bg-white text-slate-900 shadow-md border border-slate-200 hover:shadow-lg'
      }`}
    >
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-md">
          {plan.badge}
        </div>
      )}

      <div>
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-xl font-bold">{plan.name}</h3>
          <p
            className={`text-xs mt-1 min-h-[32px] ${
              isTeam ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            {plan.headline}
          </p>
        </div>

        {/* Pricing block */}
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight transition-all duration-300">
              €{displayedPrice}
            </span>
            <span
              className={`text-sm font-medium ${
                isTeam ? 'text-slate-300' : 'text-slate-500'
              }`}
            >
              {plan.perSeat ? '/ seat / mo' : '/ mo'}
            </span>
          </div>

          <div className="h-5 mt-1">
            {isAnnual && plan.monthlyEur > 0 ? (
              <span
                className={`text-xs font-medium ${
                  isTeam ? 'text-blue-300' : 'text-emerald-600'
                }`}
              >
                Billed annually (€{annualTotal}
                {plan.perSeat ? '/seat' : ''}/yr)
              </span>
            ) : (
              <span
                className={`text-xs ${
                  isTeam ? 'text-slate-400' : 'text-slate-400'
                }`}
              >
                {plan.monthlyEur === 0 ? 'Forever free' : 'Billed monthly'}
              </span>
            )}
          </div>
        </div>

        {/* Features list */}
        <div className="border-t border-slate-200/20 pt-6 mb-8">
          <p
            className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
              isTeam ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            What&apos;s included:
          </p>
          <ul className="space-y-3">
            {plan.shortFeatures.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm">
                <svg
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    isTeam ? 'text-blue-400' : 'text-blue-600'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span
                  className={isTeam ? 'text-slate-200' : 'text-slate-700'}
                >
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CTA Button */}
      <a
        href={plan.ctaHref}
        className={`w-full py-3 px-6 rounded-xl font-semibold text-center text-sm transition-all duration-200 inline-block shadow-sm ${
          isTeam
            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50'
            : plan.id === 'business'
            ? 'bg-slate-900 hover:bg-slate-800 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300'
        }`}
      >
        {plan.ctaLabel}
      </a>
    </div>
  );
}
