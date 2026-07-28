import { describe, expect, it } from 'vitest';
import { getPaddlePriceId } from './paddle';

describe('getPaddlePriceId', () => {
  it('does not create checkout for the free plan', () => {
    expect(getPaddlePriceId('free', false)).toBeNull();
  });
});
