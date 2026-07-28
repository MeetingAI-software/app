'use client';

import React, { useState } from 'react';
import { PricingPlan, getAnnualTotalEur, getEffectiveMonthlyRateEur } from '@/lib/pricing';
import { getPaddle, getPaddlePriceId } from '@/lib/paddle';

interface PricingCardProps {
  plan: PricingPlan;
  isAnnual: boolean;
}

export function PricingCard({ plan, isAnnual }: PricingCardProps) {
  const isTeam = plan.id === 'team';
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const opensCheckout = plan.id === 'solo' || plan.id === 'team';

  const displayedPrice = isAnnual
    ? getEffectiveMonthlyRateEur(plan.monthlyEur)
    : plan.monthlyEur;

  const annualTotal = getAnnualTotalEur(plan.monthlyEur);

  // Subtle 3D Card Tilt & Mouse Spotlight tracking
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Smoother, subtle tilt angles (2.5deg max)
    const rotateX = ((y - centerY) / centerY) * -2.5;
    const rotateY = ((x - centerX) / centerX) * 2.5;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.008, 1.008, 1.008)`;

    // Calculate percentage for radial spotlight
    const mousePercentX = (x / rect.width) * 100;
    const mousePercentY = (y / rect.height) * 100;
    setMousePos({ x: mousePercentX, y: mousePercentY });
    setIsHovered(true);
  };

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    setIsHovered(false);
  };

  // Subtle Magnetic Button Effect
  const handleMagneticMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.08}px, ${y * 0.08}px)`;
    btn.style.transition = 'transform 0.1s ease-out';
  };

  const handleMagneticMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    const btn = e.currentTarget;
    btn.style.transform = 'translate(0px, 0px)';
    btn.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
  };

  const handleCheckout = async () => {
    const priceId = getPaddlePriceId(plan.id, isAnnual);
    if (!priceId) {
      setCheckoutError('Checkout is not configured for this plan yet.');
      return;
    }

    setCheckoutError(null);
    setIsOpeningCheckout(true);
    try {
      const paddle = await getPaddle();
      if (!paddle) throw new Error('Paddle.js could not be initialized');
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        settings: {
          displayMode: 'overlay',
          variant: 'one-page',
          successUrl: `${window.location.origin}/checkout/success`,
        },
      });
    } catch (error) {
      console.error('Unable to open Paddle Checkout', error);
      setCheckoutError('Checkout could not be opened. Please try again.');
    } finally {
      setIsOpeningCheckout(false);
    }
  };

  return (
    <div
      onMouseMove={handleCardMouseMove}
      onMouseLeave={handleCardMouseLeave}
      style={{
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease',
      }}
      className={`relative flex flex-col justify-between p-6 sm:p-8 rounded-2xl cursor-pointer ${
        isTeam
          ? 'bg-slate-900 text-white shadow-2xl ring-2 ring-blue-500 z-10'
          : 'bg-white text-slate-900 shadow-md border border-slate-200 hover:shadow-xl'
      }`}
    >
      {/* Interactive Radial Spotlight Background clipped inside card */}
      {isHovered && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-100 transition-opacity duration-300 z-0 overflow-hidden"
          style={{
            background: isTeam
              ? `radial-gradient(400px circle at ${mousePos.x}% ${mousePos.y}%, rgba(59, 130, 246, 0.2), transparent 80%)`
              : `radial-gradient(350px circle at ${mousePos.x}% ${mousePos.y}%, rgba(59, 130, 246, 0.1), transparent 80%)`,
          }}
        />
      )}

      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-md z-30 pointer-events-none">
          {plan.badge}
        </div>
      )}

      <div className="relative z-10">
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
              <span className="text-xs text-slate-400">
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

      {/* CTA Button with Subtle Magnetic effect */}
      <div className="relative z-10">
        {opensCheckout ? (
          <button
            type="button"
            onClick={handleCheckout}
            disabled={isOpeningCheckout}
            onMouseMove={handleMagneticMouseMove}
            onMouseLeave={handleMagneticMouseLeave}
            className={`w-full py-3 px-6 rounded-xl font-semibold text-center text-sm transition-colors duration-200 inline-flex items-center justify-center gap-2 shadow-sm disabled:cursor-wait disabled:opacity-70 ${
              isTeam
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50 btn-shimmer'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300'
            }`}
          >
            <span>{isOpeningCheckout ? 'Opening checkout…' : plan.ctaLabel}</span>
            <span className="ml-1.5 font-bold text-xs opacity-80">&gt;</span>
          </button>
        ) : (
          <a
            href={plan.ctaHref}
            onMouseMove={handleMagneticMouseMove}
            onMouseLeave={handleMagneticMouseLeave}
            className={`w-full py-3 px-6 rounded-xl font-semibold text-center text-sm transition-colors duration-200 inline-flex items-center justify-center gap-2 shadow-sm ${
            isTeam
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50 btn-shimmer'
              : plan.id === 'business'
              ? 'bg-slate-900 hover:bg-slate-800 text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300'
          }`}
          >
            <span>{plan.ctaLabel}</span>
            <span className="ml-1.5 font-bold text-xs opacity-80">&gt;</span>
          </a>
        )}
        {checkoutError && <p className="mt-2 text-xs text-red-500" role="alert">{checkoutError}</p>}
      </div>
    </div>
  );
}
