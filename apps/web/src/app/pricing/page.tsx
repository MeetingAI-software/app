'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { PricingToggle } from '@/components/pricing/PricingToggle';
import { PricingCards } from '@/components/pricing/PricingCards';
import { PricingTable } from '@/components/pricing/PricingTable';
import { getPaddle } from '@/lib/paddle';
import { BUSINESS_CONTACT_HREF } from '@/lib/brand';

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(true);

  // Paddle's transaction payment links append `_ptxn` to this public page. Initializing on load
  // lets Paddle.js detect that parameter and open the matching checkout without a button click.
  useEffect(() => {
    void getPaddle().catch((error) => {
      console.error('Unable to initialize Paddle.js on the pricing page', error);
    });
  }, []);

  // Magnetic button handler for CTA section
  const handleMagneticMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
    btn.style.transition = 'transform 0.1s ease-out';
  };

  const handleMagneticMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const btn = e.currentTarget;
    btn.style.transform = 'translate(0px, 0px)';
    btn.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-50/50 text-slate-900 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      {/* Animated Hero section */}
      <div className="max-w-4xl mx-auto text-center mb-12 blur-in">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-4">
          Simple pricing for real meeting intelligence
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          No hidden fees, no fake urgency, no asterisk discounts. Clear limits and automatic audio deletion after processing.
        </p>

        {/* Toggle */}
        <PricingToggle isAnnual={isAnnual} onChange={setIsAnnual} />
      </div>

      {/* Plan cards with mouse hover spotlight & 3D tilt */}
      <PricingCards isAnnual={isAnnual} />

      <div className="mx-auto mt-8 max-w-4xl px-4 text-center text-sm leading-6 text-slate-600">
        <p className="font-semibold text-slate-800">Prices exclude VAT. Tax is calculated at checkout.</p>
        <p className="mt-1">
          Paid plans renew automatically on the selected Monthly or Annual schedule. Team pricing is per seat.
          There is no free trial. Cancel anytime through Settings and the Paddle Customer Portal.
          The first subscription purchase includes a 14-day money-back guarantee.
        </p>
      </div>

      {/* Comparison table */}
      <PricingTable isAnnual={isAnnual} />

      {/* Short & High-Impact CTA Banner */}
      <div className="max-w-5xl mx-auto mt-20 mb-12 px-4">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-8 sm:p-12 text-center shadow-2xl ring-1 ring-slate-800">
          {/* Subtle background glow */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Ready to make every meeting count?
            </h2>
            <p className="text-slate-300 text-base mb-8">
              Start in under 60 seconds. No credit card required for the Free plan.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/signup"
                onMouseMove={handleMagneticMouseMove}
                onMouseLeave={handleMagneticMouseLeave}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition-colors btn-shimmer inline-flex items-center justify-center gap-2"
              >
                <span>Start free now</span>
                <span className="ml-1.5 font-bold text-xs opacity-90">&gt;</span>
              </a>
              <a
                href={BUSINESS_CONTACT_HREF}
                onMouseMove={handleMagneticMouseMove}
                onMouseLeave={handleMagneticMouseLeave}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700 transition-colors"
              >
                Request a demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  </>
);
}
