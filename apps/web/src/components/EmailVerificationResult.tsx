import Link from 'next/link';
import type { VerifyEmailState } from '../lib/verify-email';

const CONTENT: Record<VerifyEmailState, {
  icon: string;
  iconClass: string;
  title: string;
  message: string;
  action?: { href: string; label: string };
}> = {
  verifying: {
    icon: 'progress_activity',
    iconClass: 'bg-slate-100 text-slate-700 animate-spin',
    title: 'Verifying your email…',
    message: 'Please wait while we confirm your email address.',
  },
  success: {
    icon: 'check_circle',
    iconClass: 'bg-emerald-100 text-emerald-700',
    title: 'Email verified',
    message: 'Your email address has been verified successfully.',
    action: { href: '/meetings', label: 'Continue to dashboard' },
  },
  'missing-token': {
    icon: 'link_off',
    iconClass: 'bg-red-100 text-red-700',
    title: 'Verification link is incomplete',
    message: 'This link does not contain a verification token.',
    action: { href: '/login', label: 'Back to login' },
  },
  'invalid-token': {
    icon: 'link_off',
    iconClass: 'bg-red-100 text-red-700',
    title: 'Verification link is invalid',
    message: 'The link could not be recognized. Check that you opened the complete link.',
    action: { href: '/login', label: 'Back to login' },
  },
  'expired-token': {
    icon: 'schedule',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'Verification link has expired',
    message: 'Verification links expire after 24 hours. Open Syncmemos and use "Resend email" to get a fresh one.',
    action: { href: '/meetings', label: 'Go to Syncmemos' },
  },
  'used-token': {
    icon: 'task_alt',
    iconClass: 'bg-slate-100 text-slate-700',
    title: 'Verification link was already used',
    message: 'This link cannot be used again. Your email may already be verified.',
    action: { href: '/meetings', label: 'Continue to dashboard' },
  },
  'already-verified': {
    icon: 'verified',
    iconClass: 'bg-emerald-100 text-emerald-700',
    title: 'Email already verified',
    message: 'No further action is needed for this email address.',
    action: { href: '/meetings', label: 'Continue to dashboard' },
  },
  // The API only sends this when a write was lost on the way to the database. It leaves the token
  // unconsumed, so telling the user to click the same link again is genuinely the fix.
  'not-persisted': {
    icon: 'sync_problem',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'That did not save',
    message: 'Something went wrong on our side, and your email was not verified. Open the link in your email once more — it still works.',
    action: { href: '/meetings', label: 'Go to Syncmemos' },
  },
  error: {
    icon: 'error',
    iconClass: 'bg-red-100 text-red-700',
    title: 'Verification could not be completed',
    message: 'Something went wrong while verifying your email. Please try the link again.',
    action: { href: '/login', label: 'Back to login' },
  },
};

export default function EmailVerificationResult({ state }: { state: VerifyEmailState }) {
  const content = CONTENT[state];

  return (
    <section
      aria-live="polite"
      aria-busy={state === 'verifying'}
      className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${content.iconClass}`}>
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">{content.icon}</span>
      </div>
      <h1 className="font-headline-md text-2xl font-bold text-slate-900">{content.title}</h1>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">{content.message}</p>
      {content.action && (
        <Link
          href={content.action.href}
          className="mt-6 inline-block w-full rounded bg-slate-900 px-6 py-3.5 font-label-mono text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-slate-800"
        >
          {content.action.label}
        </Link>
      )}
    </section>
  );
}
