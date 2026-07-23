'use client';

import React, { useState } from 'react';
import { PricingToggle } from '@/components/pricing/PricingToggle';
import { PricingCards } from '@/components/pricing/PricingCards';

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 py-16 px-4 sm:px-6 lg:px-8">
      {/* Hero section */}
      <div className="max-w-4xl mx-auto text-center mb-12">
        <span className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200 mb-4">
          Transparent EU Pricing
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
          Simple pricing for real meeting intelligence
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          No hidden fees, no fake urgency, no asterisk discounts. Every plan is hosted 100% in the EU with complete data privacy.
        </p>

        {/* Toggle */}
        <PricingToggle isAnnual={isAnnual} onChange={setIsAnnual} />
      </div>

      {/* Plan cards */}
      <PricingCards isAnnual={isAnnual} />
    </main>
  );
}
