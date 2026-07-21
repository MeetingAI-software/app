'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signup, ApiError } from '@/lib/api';
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
      await signup(email.trim(), password);
      router.replace('/meetings'); // signup auto-logs-in
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError('That email already has an account.');
      else if (err instanceof ApiError && err.status === 400) setError('Password must be at least 10 characters.');
      else setError(err instanceof Error ? err.message : 'Sign up failed.');
      setLoading(false);
    }
  };

  return (
    <AuthForm
      title="Create your account"
      subtitle="Your meetings, private to you."
      cta="Sign up"
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
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Log in
          </Link>
        </>
      }
    />
  );
}
