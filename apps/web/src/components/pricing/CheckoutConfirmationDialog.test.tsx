import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PLANS } from '../../lib/pricing';
import { CheckoutConfirmationDialog } from './CheckoutConfirmationDialog';

function render(planId: 'solo' | 'team', isAnnual: boolean, accepted = false, seatQuantity = 1) {
  const plan = PLANS.find((candidate) => candidate.id === planId)!;
  return renderToStaticMarkup(
    <CheckoutConfirmationDialog
      plan={plan}
      isAnnual={isAnnual}
      seatQuantity={seatQuantity}
      accepted={accepted}
      isOpeningCheckout={false}
      onSeatQuantityChange={() => {}}
      onAcceptedChange={() => {}}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
}

describe('CheckoutConfirmationDialog', () => {
  it('requires acceptance and shows all recurring purchase disclosures', () => {
    const html = render('solo', false);

    expect(html).toContain('Solo');
    expect(html).toContain('Monthly');
    expect(html).toContain('Price excluding VAT');
    expect(html).toContain('Paddle calculates and adds applicable tax at checkout');
    expect(html).toContain('renews automatically');
    expect(html).toContain('There is no free trial');
    expect(html).toContain('Paddle Customer Portal');
    expect(html).toContain('14-day money-back guarantee');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/refund-policy"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
  });

  it('shows Team seats and the annual renewal total', () => {
    const html = render('team', true, true, 3);

    expect(html).toContain('Team seats');
    expect(html).toContain('value="3"');
    expect(html).toContain('€1,123.20 per year for 3 seats');
    expect(html).not.toContain('disabled=""');
  });
});
