'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { BRAND_NAME } from '@/lib/brand';

export function Header() {
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
    <header className="bg-surface-container-lowest/80 backdrop-blur-md font-body-md text-body-md fixed top-0 w-full z-50 border-b border-slate-200 shadow-sm content-layer">
      <div className="flex justify-between items-center px-4 sm:px-8 py-4 max-w-7xl mx-auto">
        <Link
          href="/"
          className="font-headline-md text-headline-md font-bold tracking-tight text-slate-900 flex items-center gap-2 text-xl"
        >
          <Logo className="h-7 w-7 text-blue-600" />
          {BRAND_NAME}
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/#features"
            className="text-slate-600 hover:text-slate-900 transition-colors duration-200 font-medium text-sm"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="text-slate-600 hover:text-slate-900 transition-colors duration-200 font-medium text-sm"
          >
            Pricing
          </Link>
          <Link
            href="/#demo"
            className="text-slate-600 hover:text-slate-900 transition-colors duration-200 font-medium text-sm"
          >
            Demo
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link
            href="/meetings"
            className="hidden sm:inline-block text-slate-900 font-medium hover:text-blue-600 transition-colors duration-200 text-sm"
          >
            Sign In
          </Link>
          <Link
            href="/meetings"
            className="magnetic-btn btn-shimmer bg-slate-900 text-white px-5 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-sm text-sm"
            onMouseMove={handleMagneticMouseMove}
            onMouseLeave={handleMagneticMouseLeave}
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
