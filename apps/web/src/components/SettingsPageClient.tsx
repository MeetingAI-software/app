'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  changePassword,
  changeEmail,
  changeSubscription,
  createBillingPortalSession,
  deleteAccount,
  getMe,
  getSubscription,
  previewSubscriptionChange,
  ApiError,
  throttleMessage,
  type SubscriptionChangePreview,
  type SubscriptionSummary,
} from '@/lib/api';
import { getPaddlePriceId } from '@/lib/paddle';
import { PADDLE_BUYER_SUPPORT_URL } from '@/lib/brand';
import { canManageSubscription } from '@/lib/subscription';

const CARD = 'bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 shadow-sm';
const INPUT =
  'w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50';
const LABEL = 'block text-sm font-semibold text-slate-700 mb-1.5';
const PRIMARY_BTN =
  'bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shadow-sm cursor-pointer';
const OK_MSG = 'bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-lg text-sm';
const ERR_MSG = 'bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm';

export function SettingsPageClient({ legalPublished }: { legalPublished: boolean }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="font-headline-lg text-2xl font-bold text-slate-900 mb-1">Settings</h1>
        <p className="text-on-surface-variant text-sm">Manage your account.</p>
      </div>

      <SubscriptionCard legalPublished={legalPublished} />
      <ChangePasswordCard />
      <ChangeEmailCard />
      <DeleteAccountCard />

      <div>
        <Link href="/meetings" className="text-on-surface-variant hover:text-secondary text-sm font-medium">
          ← Back to meetings
        </Link>
      </div>
    </div>
  );
}

function SubscriptionCard({ legalPublished }: { legalPublished: boolean }) {
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [error, setError] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [changePreview, setChangePreview] = useState<SubscriptionChangePreview | null>(null);
  const [targetPriceId, setTargetPriceId] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeAccepted, setChangeAccepted] = useState(false);

  useEffect(() => {
    getSubscription().then(setSubscription).catch(() => setError(true));
  }, []);

  const planName = subscription
    ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
    : 'Loading…';
  const renewal = subscription?.subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(subscription.subscription.currentPeriodEnd))
    : null;
  const currentPriceId = subscription?.subscription?.priceId ?? null;
  const isAnnual = currentPriceId === getPaddlePriceId('solo', true)
    || currentPriceId === getPaddlePriceId('team', true);
  const targetPlan = subscription?.plan === 'solo' ? 'team' : subscription?.plan === 'team' ? 'solo' : null;
  const availableTargetPriceId = targetPlan ? getPaddlePriceId(targetPlan, isAnnual) : null;
  const showManageSubscription = subscription
    ? canManageSubscription(subscription.status, Boolean(subscription.subscription))
    : false;

  async function openBillingPortal() {
    if (openingPortal) return;
    setOpeningPortal(true);
    setPortalError(null);
    try {
      const { url } = await createBillingPortalSession();
      window.location.assign(url);
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Could not open billing management.');
      setOpeningPortal(false);
    }
  }

  async function previewPlanChange() {
    if (!availableTargetPriceId || changingPlan) return;
    setChangingPlan(true);
    setChangeError(null);
    setChangeAccepted(false);
    try {
      const preview = await previewSubscriptionChange(availableTargetPriceId);
      setTargetPriceId(availableTargetPriceId);
      setChangePreview(preview);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Could not preview the plan change.');
    } finally {
      setChangingPlan(false);
    }
  }

  async function confirmPlanChange() {
    if (!targetPriceId || changingPlan) return;
    setChangingPlan(true);
    setChangeError(null);
    try {
      await changeSubscription(targetPriceId);
      setChangePreview(null);
      setTargetPriceId(null);
      setChangeAccepted(true);

      // Paid access remains webhook-driven. Poll briefly so the mirrored plan replaces the old UI state.
      for (const delay of [1000, 2000, 3000]) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        const latest = await getSubscription();
        setSubscription(latest);
        if (latest.subscription?.priceId === targetPriceId) break;
      }
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Could not change the subscription.');
    } finally {
      setChangingPlan(false);
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900">Subscription</h2>
          {error ? (
            <p className="mt-2 text-sm text-red-600">Could not load your subscription.</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-slate-900">{planName}</p>
              <p className="mt-1 text-sm text-slate-500">
                {subscription?.status === 'none' ? 'Free plan' : `Status: ${subscription?.status ?? 'loading'}`}
                {renewal ? ` · Current period ends ${renewal}` : ''}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {showManageSubscription && (
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={openingPortal}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {openingPortal ? 'Opening…' : 'Manage subscription'}
            </button>
          )}
          <Link href="/pricing" className="rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Compare plans
          </Link>
          {availableTargetPriceId && !subscription?.subscription?.scheduledChangeAction && (
            <button
              type="button"
              onClick={previewPlanChange}
              disabled={changingPlan}
              className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {changingPlan && !changePreview ? 'Calculating…' : `Switch to ${targetPlan === 'team' ? 'Team' : 'Solo'}`}
            </button>
          )}
        </div>
      </div>
      {portalError && <div className={`${ERR_MSG} mt-4`}>{portalError}</div>}
      {legalPublished && (
        <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <p>
            To exercise a statutory withdrawal right, open Paddle Buyer Support, select
            {' '}<strong>Request refund</strong>, and use the purchase details from your Paddle receipt.
          </p>
          <a
            href={PADDLE_BUYER_SUPPORT_URL}
            className="mt-3 inline-flex font-semibold text-blue-700 underline"
          >
            Exercise withdrawal right
          </a>
        </div>
      )}
      {changeError && <div className={`${ERR_MSG} mt-4`}>{changeError}</div>}
      {changeAccepted && (
        <div className={`${OK_MSG} mt-4`}>
          Paddle accepted the change. Your plan updates here as soon as the webhook arrives.
        </div>
      )}
      {changePreview && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
          <p className="font-bold text-slate-900">
            Confirm switch to {changePreview.targetPlan === 'team' ? 'Team' : 'Solo'}
          </p>
          <p className="mt-2">
            {changePreview.prorationBillingMode === 'prorated_immediately'
              ? changePreview.immediateAmount && changePreview.immediateCurrency
                ? `${formatMoney(changePreview.immediateAmount, changePreview.immediateCurrency)} will be charged now.`
                : 'No immediate charge is due.'
              : 'The plan changes now and its prorated adjustment is billed at the next renewal.'}
          </p>
          {changePreview.recurringAmount && changePreview.recurringCurrency && (
            <p className="mt-1">
              Then {formatMoney(changePreview.recurringAmount, changePreview.recurringCurrency)} per {changePreview.targetInterval === 'annual' ? 'year' : 'month'}
              {changePreview.nextBilledAt
                ? ` from ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(changePreview.nextBilledAt))}`
                : ''}.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={confirmPlanChange} disabled={changingPlan} className={PRIMARY_BTN}>
              {changingPlan ? 'Changing…' : 'Confirm plan change'}
            </button>
            <button
              type="button"
              onClick={() => { setChangePreview(null); setTargetPriceId(null); setChangeError(null); }}
              disabled={changingPlan}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {subscription?.subscription?.scheduledChangeAction && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Scheduled change: {subscription.subscription.scheduledChangeAction}
          {subscription.subscription.scheduledChangeAt
            ? ` on ${new Intl.DateTimeFormat().format(new Date(subscription.subscription.scheduledChangeAt))}`
            : ''}
        </div>
      )}
    </div>
  );
}

function formatMoney(amount: string | null, currency: string | null): string {
  if (!amount || !currency) return '—';
  const zeroDecimalCurrencies = new Set(['CLP', 'JPY', 'KRW']);
  const divisor = zeroDecimalCurrencies.has(currency) ? 1 : 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) / divisor);
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect current password.'
          : err instanceof ApiError && err.status === 400
            ? 'New password must be at least 10 characters.'
            : err instanceof Error
              ? err.message
              : 'Could not change password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className="text-slate-900 font-bold mb-1">Change password</h2>
      <p className="text-on-surface-variant text-sm mb-4">Changing your password signs out your other devices.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={LABEL}>Current password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="••••••••"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>New password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="At least 10 characters"
            className={INPUT}
          />
        </div>
        {error && <div className={ERR_MSG}>{error}</div>}
        {done && <div className={OK_MSG}>Password updated.</div>}
        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

function ChangeEmailCard() {
  const [current, setCurrent] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      await changeEmail(current, email);
      setCurrent('');
      setEmail('');
      setDone(true);
    } catch (err) {
      // Capped at 3/hour per account since it mails whatever address is typed here, so 429 and the
      // global-budget 503 are both reachable — neither means the password was wrong.
      setError(
        throttleMessage(err)
        ?? (err instanceof ApiError && err.status === 401
          ? 'Incorrect password.'
          : err instanceof ApiError && err.status === 409
            ? 'That email is already in use.'
            : err instanceof Error
              ? err.message
              : 'Could not change email.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className="text-slate-900 font-bold mb-1">Change email</h2>
      <p className="text-on-surface-variant text-sm mb-4">You&apos;ll sign in with the new email next time.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={LABEL}>New email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="you@company.com"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Confirm your password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setDone(false); }}
            disabled={loading}
            placeholder="••••••••"
            className={INPUT}
          />
        </div>
        {error && <div className={ERR_MSG}>{error}</div>}
        {done && <div className={OK_MSG}>Email updated. Reload to see it in the header.</div>}
        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? 'Saving…' : 'Update email'}
        </button>
      </form>
    </div>
  );
}

function DeleteAccountCard() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [googleOnly, setGoogleOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getMe()
      .then(({ user }) => setGoogleOnly(user.hasPassword === false && user.hasGoogleLogin === true))
      .catch(() => undefined);
  }, []);

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await deleteAccount(password);
      router.replace('/login'); // cookie already cleared server-side
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? googleOnly ? 'Type DELETE exactly to confirm.' : 'Incorrect password.'
          : err instanceof Error
            ? err.message
            : 'Could not delete account.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-red-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-red-600 font-bold mb-1">Delete account</h2>
      <p className="text-on-surface-variant text-sm mb-4">
        Deletes every meeting, document, transcript and recording you own. Your share links stop working.{' '}
        <strong className="text-slate-700">This cannot be undone.</strong>
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          Delete my account…
        </button>
      ) : (
        <form onSubmit={onDelete} className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            {googleOnly ? 'Type DELETE to confirm' : 'Confirm your password to continue'}
          </label>
          <input
            type={googleOnly ? 'text' : 'password'}
            required
            autoFocus
            autoComplete={googleOnly ? 'off' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder={googleOnly ? 'DELETE' : '••••••••'}
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-colors disabled:opacity-50"
          />
          {error && <div className={ERR_MSG}>{error}</div>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading || (googleOnly && password !== 'DELETE')}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors shadow-sm cursor-pointer"
            >
              {loading ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setError(null);
                setPassword('');
              }}
              disabled={loading}
              className="text-on-surface-variant hover:text-slate-900 text-sm px-2 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
