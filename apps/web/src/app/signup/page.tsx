'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signup, ApiError } from '@/lib/api';
import { destinationAfterAuthentication } from '@/lib/auth-flow';
import AuthForm from '@/components/AuthForm';

export default function SignupPage() {
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
      const response = await signup(email.trim(), password);
      router.replace(destinationAfterAuthentication(response)); // signup auto-logs-in
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError('That email already has an account.');
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
      onSubmit={onSubmit}
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
