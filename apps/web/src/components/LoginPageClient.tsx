'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, ApiError } from '@/lib/api';
import { destinationAfterAuthentication } from '@/lib/auth-flow';
import AuthForm from '@/components/AuthForm';

export function LoginPageClient({ legalPublished }: { legalPublished: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await login(email.trim(), password);
      router.replace(destinationAfterAuthentication(response));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Wrong email or password.'
          : err instanceof Error
            ? err.message
            : 'Login failed.'
      );
      setLoading(false);
    }
  };

  return (
    <AuthForm
      mode="login"
      title="Welcome back"
      subtitle="Precise summaries for high-performing teams."
      cta="Sign In"
      loading={loading}
      error={error}
      email={email}
      password={password}
      onEmail={setEmail}
      onPassword={setPassword}
      onSubmit={onSubmit}
      legalPublished={legalPublished}
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-slate-900 font-medium hover:underline decoration-slate-200 underline-offset-4">
            Sign up
          </Link>
        </>
      }
    />
  );
}
