'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, ApiError } from '@/lib/api';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
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
      await login(email.trim(), password);
      router.replace('/meetings');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Wrong email or password.'
          : err instanceof Error
            ? err.message
            : 'Log in failed.'
      );
      setLoading(false);
    }
  };

  return (
    <AuthForm
      mode="login"
      title="Log in"
      subtitle="Welcome back to MeetingAI."
      cta="Log In"
      loading={loading}
      error={error}
      email={email}
      password={password}
      onEmail={setEmail}
      onPassword={setPassword}
      onSubmit={onSubmit}
      footer={
        <>
          New here?{' '}
          <Link href="/signup" className="text-secondary hover:underline font-medium">
            Create an account
          </Link>
        </>
      }
    />
  );
}
