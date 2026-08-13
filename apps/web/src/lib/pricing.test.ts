import { describe, expect, it } from 'vitest';
import {
  ANNUAL_DISCOUNT,
  PLANS,
  getAnnualTotalEur,
  getEffectiveMonthlyRateEur,
} from './pricing';

describe('Pricing single source of truth (pricing.ts)', () => {
  it('defines 20% annual discount constant', () => {
    expect(ANNUAL_DISCOUNT).toBe(0.2);
  });

  it('contains exactly four plans', () => {
    expect(PLANS).toHaveLength(4);
    const planIds = PLANS.map((p) => p.id);
    expect(planIds).toEqual(['free', 'solo', 'team', 'business']);
  });

  it('computes effective monthly rate and annual total accurately for all plans', () => {
    // Free (€0)
    expect(getEffectiveMonthlyRateEur(0)).toBe(0);
    expect(getAnnualTotalEur(0)).toBe(0);

    // Solo (€19) -> 19 * 0.8 = 15.20 / mo -> 182.40 / yr
    expect(getEffectiveMonthlyRateEur(19)).toBe(15.2);
    expect(getAnnualTotalEur(19)).toBe(182.4);

    // Team (€39) -> 39 * 0.8 = 31.20 / mo -> 374.40 / yr
    expect(getEffectiveMonthlyRateEur(39)).toBe(31.2);
    expect(getAnnualTotalEur(39)).toBe(374.4);

    // Business (€79) -> 79 * 0.8 = 63.20 / mo -> 758.40 / yr
    expect(getEffectiveMonthlyRateEur(79)).toBe(63.2);
    expect(getAnnualTotalEur(79)).toBe(758.4);
  });

  it('configures CTAs correctly per specification', () => {
    const free = PLANS.find((p) => p.id === 'free');
    const solo = PLANS.find((p) => p.id === 'solo');
    const team = PLANS.find((p) => p.id === 'team');
    const business = PLANS.find((p) => p.id === 'business');

    expect(free?.ctaHref).toBe('/signup');
    expect(free?.ctaLabel).toBe('Get started');

    expect(solo?.ctaHref).toBe('/signup');
    expect(solo?.ctaLabel).toBe('Choose Solo');

    expect(team?.ctaHref).toBe('/signup');
    expect(team?.ctaLabel).toBe('Choose Team');

    expect(business?.ctaHref).toBe(
      'mailto:support@syncmemos.com?subject=Syncmemos%20Business%20inquiry',
    );
    expect(business?.ctaLabel).toBe('Contact us');
  });

  it('elevates Team plan with Best value badge', () => {
    const team = PLANS.find((p) => p.id === 'team');
    expect(team?.badge).toBe('Best value');

    const nonTeamBadges = PLANS.filter((p) => p.id !== 'team').map((p) => p.badge);
    expect(nonTeamBadges.every((b) => b === undefined)).toBe(true);
  });

  it('advertises only implemented deletion controls across all plans', () => {
    PLANS.forEach((plan) => {
      expect(plan.features.autoAudioDeletion).toBe(true);
      expect(plan.features.accountErasure).toBe(true);
      expect(plan.shortFeatures.join(' ')).not.toMatch(/EU data residency/i);
    });
  });

  it('gates admin controls & audit log exclusively to Business plan', () => {
    const business = PLANS.find((p) => p.id === 'business');
    expect(business?.features.adminControlsAndAuditLog).toBe(true);

    const otherPlans = PLANS.filter((p) => p.id !== 'business');
    otherPlans.forEach((plan) => {
      expect(plan.features.adminControlsAndAuditLog).toBe(false);
    });
  });
});
