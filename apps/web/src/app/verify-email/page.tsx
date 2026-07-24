'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing verification token in link.');
      return;
    }

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error?.message || 'Invalid or expired verification link.');
        }
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to verify email.');
      }
    }

    verify();
  }, [token]);

  return (
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 shadow-sm space-y-6 text-center">
      {status === 'verifying' && (
        <div className="space-y-4">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <h1 className="font-headline-md text-2xl font-bold text-slate-900">Verifying your email...</h1>
          <p className="text-on-surface-variant text-sm">Please wait while we confirm your email address.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4">
          <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-2xl">check_circle</span>
          </div>
          <h1 className="font-headline-md text-2xl font-bold text-slate-900">Email Verified!</h1>
          <p className="text-on-surface-variant text-sm">Your email address has been successfully verified.</p>
          <div className="pt-2">
            <Link
              href="/meetings"
              className="inline-block w-full bg-slate-900 text-white font-label-mono text-xs uppercase tracking-wider font-bold py-3.5 px-6 rounded transition-all hover:bg-slate-800 shadow-sm"
            >
              Go to Dashboard →
            </Link>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-2xl">error</span>
          </div>
          <h1 className="font-headline-md text-2xl font-bold text-slate-900">Verification Failed</h1>
          <p className="text-red-600 text-sm">{errorMessage}</p>
          <div className="pt-2 space-y-2">
            <Link
              href="/login"
              className="inline-block w-full bg-slate-900 text-white font-label-mono text-xs uppercase tracking-wider font-bold py-3.5 px-6 rounded transition-all hover:bg-slate-800 shadow-sm"
            >
              Back to Login
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <div className="min-h-screen bg-[#f9f9f9] flex flex-col justify-between items-center p-4">
        {/* Simple Top Bar */}
        <header className="w-full max-w-container-max py-4 flex justify-between items-center">
          <Link href="/" className="font-headline-md text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px]">summarize</span>
            MeetingAI
          </Link>
        </header>

        {/* Center Content */}
        <main className="flex-1 flex items-center justify-center w-full my-auto">
          <Suspense fallback={<div className="text-center text-slate-500 font-medium">Loading verification page...</div>}>
            <VerifyEmailContent />
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="w-full text-center py-6 text-xs text-slate-400">
          © {new Date().getFullYear()} MeetingAI Inc. All rights reserved.
        </footer>
      </div>
    </>
  );
}
