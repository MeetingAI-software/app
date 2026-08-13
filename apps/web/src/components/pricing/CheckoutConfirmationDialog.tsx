'use client';

import { createPortal } from 'react-dom';
import type { PricingPlan } from '../../lib/pricing';
import { getAnnualTotalEur } from '../../lib/pricing';

interface CheckoutConfirmationDialogProps {
  plan: PricingPlan;
  isAnnual: boolean;
  seatQuantity: number;
  accepted: boolean;
  isOpeningCheckout: boolean;
  onSeatQuantityChange: (quantity: number) => void;
  onAcceptedChange: (accepted: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function CheckoutConfirmationDialog({
  plan,
  isAnnual,
  seatQuantity,
  accepted,
  isOpeningCheckout,
  onSeatQuantityChange,
  onAcceptedChange,
  onCancel,
  onConfirm,
}: CheckoutConfirmationDialogProps) {
  const intervalLabel = isAnnual ? 'Annual' : 'Monthly';
  const unitPrice = isAnnual ? getAnnualTotalEur(plan.monthlyEur) : plan.monthlyEur;
  const totalPrice = unitPrice * seatQuantity;
  const priceSuffix = isAnnual ? 'per year' : 'per month';
  const seatSuffix = plan.perSeat ? ` for ${seatQuantity} ${seatQuantity === 1 ? 'seat' : 'seats'}` : '';

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`checkout-title-${plan.id}`}
        aria-describedby={`checkout-details-${plan.id}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Confirm subscription</p>
            <h2 id={`checkout-title-${plan.id}`} className="mt-1 text-2xl font-bold">
              {plan.name} · {intervalLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close checkout confirmation"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>

        {plan.perSeat && (
          <div className="mt-6">
            <label htmlFor={`checkout-seats-${plan.id}`} className="block text-sm font-semibold">
              Team seats
            </label>
            <input
              id={`checkout-seats-${plan.id}`}
              type="number"
              min={1}
              max={100}
              step={1}
              value={seatQuantity}
              onChange={(event) => onSeatQuantityChange(Number(event.target.value))}
              className="mt-2 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div id={`checkout-details-${plan.id}`} className="mt-6 rounded-xl bg-slate-50 p-4 text-sm">
          <dl className="space-y-3">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Billing</dt>
              <dd className="font-semibold">{intervalLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Price excluding VAT</dt>
              <dd className="text-right font-semibold">
                {formatEur(totalPrice)} {priceSuffix}{seatSuffix}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-slate-600">Paddle calculates and adds applicable tax at checkout.</p>
        </div>

        <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            The subscription renews automatically at {formatEur(totalPrice)} {priceSuffix}{seatSuffix} until canceled.
          </li>
          <li>There is no free trial.</li>
          <li>You can cancel through Settings and the Paddle Customer Portal.</li>
          <li>Your first subscription purchase is covered by our 14-day money-back guarantee.</li>
        </ul>

        <p className="mt-5 text-sm text-slate-600">
          Review our <a href="/terms" className="font-semibold text-blue-700 underline">Terms</a> and{' '}
          <a href="/refund-policy" className="font-semibold text-blue-700 underline">Refund Policy</a>.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <input
            id={`checkout-accept-${plan.id}`}
            type="checkbox"
            checked={accepted}
            onChange={(event) => onAcceptedChange(event.target.checked)}
            className="mr-3 h-4 w-4 rounded border-slate-300 align-top"
          />
          <label htmlFor={`checkout-accept-${plan.id}`} className="text-sm leading-6 text-slate-800">
            I agree to the Terms and Refund Policy and confirm this recurring subscription purchase.
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isOpeningCheckout}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!accepted || isOpeningCheckout}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isOpeningCheckout ? 'Opening checkout…' : 'Continue to secure checkout'}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
