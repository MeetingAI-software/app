'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import EmailVerificationResult from '../../components/EmailVerificationResult';
import {
  notifyEmailVerificationCompleted,
  stateForVerificationError,
  verifyEmailOnce,
  type VerifyEmailState,
} from '../../lib/verify-email';
import { LogoMark } from '@/components/Logo';

function VerifyEmailContent() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<VerifyEmailState | 'ready'>('ready');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || state !== 'ready') return;
    if (newPassword !== confirmPassword) {
      setFormError('The passwords do not match.');
      return;
    }
    setFormError('');
    setState('verifying');
    try {
      await verifyEmailOnce(token, newPassword);
      notifyEmailVerificationCompleted();
      setState('success');
    } catch (error: unknown) {
      setState(stateForVerificationError(error));
    } finally {
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  if (!token) return <EmailVerificationResult state="missing-token" />;
  if (state !== 'ready') return <EmailVerificationResult state={state} />;
  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="font-headline-md text-2xl font-bold text-slate-900">Verify your email</h1>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        Set a new password to confirm this address. Previous passwords and sessions will stop working.
      </p>
      <label htmlFor="verification-password" className="mt-6 block text-sm font-medium text-slate-900">New password</label>
      <input id="verification-password" type="password" autoComplete="new-password" minLength={10} required
        value={newPassword} onChange={(event) => setNewPassword(event.target.value)}
        className="mt-2 w-full rounded border border-slate-300 px-3 py-3 text-slate-900" />
      <label htmlFor="verification-confirm" className="mt-4 block text-sm font-medium text-slate-900">Confirm new password</label>
      <input id="verification-confirm" type="password" autoComplete="new-password" minLength={10} required
        value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
        className="mt-2 w-full rounded border border-slate-300 px-3 py-3 text-slate-900" />
      {formError && <p role="alert" className="mt-3 text-sm text-red-700">{formError}</p>}
      <button type="submit" className="mt-6 w-full rounded bg-slate-900 px-6 py-3 text-sm font-semibold text-white">
        Verify email and set password
      </button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center p-4">
      <header className="w-full max-w-container-max py-4">
        <Link href="/" className="font-headline-md text-xl font-bold text-slate-900 flex items-center gap-2">
          <LogoMark />
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
