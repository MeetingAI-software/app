'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signup, ApiError, throttleMessage } from '@/lib/api';
import { destinationAfterAuthentication } from '@/lib/auth-flow';
import AuthForm from '@/components/AuthForm';

export function SignupPageClient({ legalVersion }: { legalVersion: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [businessUseConfirmed, setBusinessUseConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!legalVersion) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 flex items-center justify-center">
        <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Registration is temporarily closed</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            New accounts stay disabled until the current privacy notice, terms, and seller information are published.
          </p>
          <Link href="/login" className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
            Log in to an existing account
          </Link>
        </section>
      </main>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await signup(email.trim(), password, {
        organizationName: organizationName.trim(),
        businessUseConfirmed: true,
        termsVersion: legalVersion,
      });
      router.replace(destinationAfterAuthentication(response)); // signup auto-logs-in
    } catch (err) {
      // 429 is reachable here now that signup is capped per IP, and it is not a credentials
      // problem — checked before the status branches so it never falls through to the raw message.
      const throttled = throttleMessage(err);
      if (throttled) setError(throttled);
      else if (err instanceof ApiError && err.status === 409) setError('That email already has an account.');
      else if (err instanceof ApiError && err.status === 400) setError('Password must be at least 10 characters.');
      else setError(err instanceof Error ? err.message : 'Sign up failed.');
      setLoading(false);
    }
  };

  return (
    <AuthForm
      mode="signup"
      title="Create account"
      subtitle="Precise summaries for high-performing teams."
      cta="Sign Up"
      loading={loading}
      error={error}
      email={email}
      password={password}
      onEmail={setEmail}
      onPassword={setPassword}
      organizationName={organizationName}
      onOrganizationName={setOrganizationName}
      businessUseConfirmed={businessUseConfirmed}
      onBusinessUseConfirmed={setBusinessUseConfirmed}
      onSubmit={onSubmit}
      legalPublished
      passwordAutoComplete="new-password"
      passwordHint="At least 10 characters."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-slate-900 font-medium hover:underline decoration-slate-200 underline-offset-4">
            Log in
          </Link>
        </>
      }
    />
  );
}
