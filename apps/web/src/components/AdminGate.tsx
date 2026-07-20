'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getStoredAccessCode, setStoredAccessCode, getMeetings } from '../lib/api';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [code, setCode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Determine if this is a public share route (e.g., /s/token)
  const isPublicRoute = pathname?.startsWith('/s/');

  useEffect(() => {
    if (isPublicRoute) {
      setIsAuthenticated(true);
      return;
    }

    const stored = getStoredAccessCode();
    if (stored) {
      // Validate the code with a test call
      getMeetings()
        .then(() => {
          setIsAuthenticated(true);
        })
        .catch((err) => {
          if (err.status === 401) {
            setStoredAccessCode(null);
            setIsAuthenticated(false);
            setError('Stored session expired. Please re-enter the access code.');
          } else {
            // Network or server issues - allow rendering but don't clear code
            setIsAuthenticated(true);
          }
        });
    } else {
      setIsAuthenticated(false);
    }
  }, [isPublicRoute]);

  // Listen to global 401 events dispatched by our api client
  useEffect(() => {
    if (isPublicRoute) return;

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setError('Wrong code or session expired.');
    };

    window.addEventListener('unauthorized-api-call', handleUnauthorized);
    return () => {
      window.removeEventListener('unauthorized-api-call', handleUnauthorized);
    };
  }, [isPublicRoute]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    // Temporarily store the code for validation
    setStoredAccessCode(code);

    try {
      await getMeetings();
      setIsAuthenticated(true);
    } catch (err: any) {
      setStoredAccessCode(null);
      if (err.status === 401) {
        setError('Invalid access code.');
      } else {
        setError(err.message || 'Validation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // If loading authentication state initially, show a black blank screen or loader to prevent flash
  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-[#0d0f12]" />;
  }

  // Bypass the gate for public routes or authorized users
  if (isPublicRoute || isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-indigo-500/10 text-indigo-400 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider mb-3 border border-indigo-500/20">
            Access Restrained
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Enter Access Code
          </h1>
          <p className="text-gray-400 text-sm">
            Please enter your administrator access code to manage meetings.
          </p>
        </div>

        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                required
                autoFocus
                placeholder="••••••••"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
                className="w-full text-center bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 tracking-widest text-lg"
              />
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3.5 rounded-xl text-xs text-center font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-xl py-3 font-semibold text-sm transition-all shadow-lg active:scale-[0.98] disabled:scale-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Verifying...
                </>
              ) : (
                'Unlock Platform'
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
