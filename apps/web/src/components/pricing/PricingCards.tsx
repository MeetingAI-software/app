'use client';

import React from 'react';
import { PLANS } from '@/lib/pricing';
import { PricingCard } from './PricingCard';

interface PricingCardsProps {
  isAnnual: boolean;
}

export function PricingCards({ isAnnual }: PricingCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4 max-w-7xl mx-auto px-4 items-stretch py-4">
      {PLANS.map((plan) => (
        <PricingCard key={plan.id} plan={plan} isAnnual={isAnnual} />
      ))}
    </div>
  );
}
