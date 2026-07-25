'use client';

import { useState } from 'react';
import { resendVerification } from '../lib/api';
import {
  verificationBannerButtonLabel,
  type VerificationBannerStatus,
} from '../lib/email-verification';

export default function EmailVerificationBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<VerificationBannerStatus>('idle');

  const handleResend = async () => {
    if (status === 'sending') return;
    setStatus('sending');
    try {
      await resendVerification(email);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <aside
      aria-label="Email verification required"
      className="border-b border-amber-200 bg-amber-50 text-amber-950"
    >
      <div className="max-w-container-max mx-auto px-margin-page py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-amber-600 text-xl" aria-hidden="true">
            mark_email_unread
          </span>
          <div>
            <p className="text-sm font-semibold">Verify your email address</p>
            <p className="text-xs text-amber-800">
              We sent a verification link to <strong>{email}</strong>. The link expires after 24 hours.
            </p>
            <p className="text-xs text-amber-800 min-h-4" aria-live="polite">
              {status === 'sent' && 'A new verification email has been sent.'}
              {status === 'error' && 'We could not send the email. Please try again.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResend}
          disabled={status === 'sending'}
          className="self-start sm:self-auto shrink-0 rounded bg-amber-200/80 hover:bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-950 transition-colors disabled:cursor-wait disabled:opacity-70"
        >
          {verificationBannerButtonLabel(status)}
        </button>
      </div>
    </aside>
  );
}
