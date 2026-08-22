'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import EmailVerificationResult from '../../components/EmailVerificationResult';
import {
  notifyEmailVerificationCompleted,
  stateForVerificationError,
  verifyEmailOnce,
  type VerifyEmailState,
} from '../../lib/verify-email';
import { Logo } from '../../components/Logo';

function VerifyEmailContent() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<VerifyEmailState>('verifying');

  useEffect(() => {
    if (!token) return;

    let active = true;
    verifyEmailOnce(token)
      .then(() => {
        if (!active) return;
        notifyEmailVerificationCompleted();
        setState('success');
      })
      .catch((error: unknown) => {
        if (active) setState(stateForVerificationError(error));
      });

    return () => {
      active = false;
    };
  }, [token]);

  return <EmailVerificationResult state={token ? state : 'missing-token'} />;
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center p-4">
      <header className="w-full max-w-container-max py-4">
        <Link href="/" className="font-headline-md text-xl font-bold text-slate-900 flex items-center gap-2">
          <Logo className="h-6 w-6" />
          Syncmemos
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center w-full py-8">
        <Suspense fallback={<EmailVerificationResult state="verifying" />}>
          <VerifyEmailContent />
        </Suspense>
      </main>

      <footer className="w-full py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Syncmemos. All rights reserved.
      </footer>
    </div>
  );
}
