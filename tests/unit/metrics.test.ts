import { describe, it, expect } from 'vitest';
import {
  normalizeToMonthly,
  computeMrr,
  computeChurnRate,
  computeArpu,
  computeLtv,
  computeGrowthRate,
  computeNrr,
} from '../../src/utils/metrics.js';

// Helper to build a minimal mock subscription
function mockSub(unitAmount: number, interval: string, intervalCount: number, quantity = 1) {
  return {
    items: {
      data: [
        {
          price: {
            unit_amount: unitAmount,
            recurring: { interval, interval_count: intervalCount },
          },
          quantity,
        },
      ],
    },
  } as any;
}

// ---------------------------------------------------------------------------
// normalizeToMonthly
// ---------------------------------------------------------------------------
describe('normalizeToMonthly', () => {
  it('returns same amount for monthly interval_count=1', () => {
    expect(normalizeToMonthly(2900, 'month', 1)).toBe(2900);
  });

  it('divides by 12 for yearly interval_count=1', () => {
    expect(normalizeToMonthly(12000, 'year', 1)).toBe(1000);
  });

  it('divides by interval_count for quarterly (month, 3)', () => {
    expect(normalizeToMonthly(9000, 'month', 3)).toBe(3000);
  });

  it('multiplies by 30/7 for weekly interval_count=1', () => {
    const result = normalizeToMonthly(700, 'week', 1);
    expect(result).toBeCloseTo(700 * (30 / 7), 5);
  });

  it('multiplies by 30 for daily interval_count=1', () => {
    expect(normalizeToMonthly(100, 'day', 1)).toBe(3000);
  });

  it('handles interval_count > 1 for yearly', () => {
    // $240 every 2 years => $240 / (2*12) = $10/month
    expect(normalizeToMonthly(24000, 'year', 2)).toBe(1000);
  });

  it('handles interval_count > 1 for daily', () => {
    // $200 every 2 days => ($200/2) * 30 = $3000/month
    expect(normalizeToMonthly(200, 'day', 2)).toBe(3000);
  });

  it('returns amount as-is for unknown interval', () => {
    expect(normalizeToMonthly(5000, 'unknown', 1)).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// computeMrr
// ---------------------------------------------------------------------------
describe('computeMrr', () => {
  it('computes MRR for a single monthly subscription', () => {
    const subs = [mockSub(2900, 'month', 1)];
    const { mrr, breakdown } = computeMrr(subs);
    expect(mrr).toBe(2900);
    expect(breakdown.monthly).toBe(2900);
    expect(breakdown.annual).toBe(0);
  });

  it('computes MRR for multiple subscriptions', () => {
    const subs = [mockSub(2900, 'month', 1), mockSub(4900, 'month', 1)];
    const { mrr } = computeMrr(subs);
    expect(mrr).toBe(7800);
  });

  it('normalizes annual subscription to monthly', () => {
    const subs = [mockSub(12000, 'year', 1)];
    const { mrr, breakdown } = computeMrr(subs);
    expect(mrr).toBe(1000);
    expect(breakdown.annual).toBe(1000);
    expect(breakdown.monthly).toBe(0);
  });

  it('handles mixed intervals', () => {
    const subs = [
      mockSub(2900, 'month', 1), // $29/mo
      mockSub(12000, 'year', 1), // $100/mo
    ];
    const { mrr } = computeMrr(subs);
    expect(mrr).toBe(3900);
  });

  it('accounts for quantity', () => {
    const subs = [mockSub(2900, 'month', 1, 3)];
    const { mrr } = computeMrr(subs);
    expect(mrr).toBe(8700);
  });

  it('categorizes quarterly subscriptions', () => {
    const subs = [mockSub(9000, 'month', 3)];
    const { mrr, breakdown } = computeMrr(subs);
    expect(mrr).toBe(3000);
    expect(breakdown.quarterly).toBe(3000);
  });

  it('returns zero for empty subscription list', () => {
    const { mrr } = computeMrr([]);
    expect(mrr).toBe(0);
  });

  it('skips items without unit_amount or recurring', () => {
    const subs = [
      {
        items: {
          data: [
            {
              price: { unit_amount: null, recurring: { interval: 'month', interval_count: 1 } },
              quantity: 1,
            },
            { price: { unit_amount: 1000, recurring: null }, quantity: 1 },
          ],
        },
      } as any,
    ];
    const { mrr } = computeMrr(subs);
    expect(mrr).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeChurnRate
// ---------------------------------------------------------------------------
describe('computeChurnRate', () => {
  it('computes basic churn rates', () => {
    const { subscriberChurnRate, revenueChurnRate } = computeChurnRate(90, 10, 500, 5000);
    expect(subscriberChurnRate).toBe(10 / 100);
    // revenueChurnRate = lostMrr / (totalMrr + lostMrr) = 500 / 5500
    expect(revenueChurnRate).toBeCloseTo(500 / 5500, 5);
  });

  it('returns zero churn when no cancellations', () => {
    const { subscriberChurnRate, revenueChurnRate } = computeChurnRate(100, 0, 0, 5000);
    expect(subscriberChurnRate).toBe(0);
    expect(revenueChurnRate).toBe(0);
  });

  it('returns 100% subscriber churn when all canceled', () => {
    const { subscriberChurnRate } = computeChurnRate(0, 50, 5000, 0);
    expect(subscriberChurnRate).toBe(1);
  });

  it('handles zero totalMrr for revenue churn', () => {
    const { revenueChurnRate } = computeChurnRate(0, 5, 0, 0);
    expect(revenueChurnRate).toBe(0);
  });

  it('handles zero active and zero canceled', () => {
    const { subscriberChurnRate } = computeChurnRate(0, 0, 0, 0);
    expect(subscriberChurnRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeArpu
// ---------------------------------------------------------------------------
describe('computeArpu', () => {
  it('computes basic ARPU', () => {
    expect(computeArpu(10000, 4)).toBe(2500);
  });

  it('returns zero when no subscribers', () => {
    expect(computeArpu(10000, 0)).toBe(0);
  });

  it('handles single subscriber', () => {
    expect(computeArpu(2900, 1)).toBe(2900);
  });
});

// ---------------------------------------------------------------------------
// computeLtv
// ---------------------------------------------------------------------------
describe('computeLtv', () => {
  it('computes basic LTV', () => {
    // ARPU = 5000 cents, churn = 10% => lifespan = 10 months, LTV = 50000
    const { ltv, averageLifespanMonths } = computeLtv(5000, 0.1);
    expect(ltv).toBe(50000);
    expect(averageLifespanMonths).toBe(10);
  });

  it('returns zero LTV and lifespan when churn is zero', () => {
    const { ltv, averageLifespanMonths } = computeLtv(5000, 0);
    expect(ltv).toBe(0);
    expect(averageLifespanMonths).toBe(0);
  });

  it('returns zero LTV when churn is negative', () => {
    const { ltv, averageLifespanMonths } = computeLtv(5000, -0.05);
    expect(ltv).toBe(0);
    expect(averageLifespanMonths).toBe(0);
  });

  it('handles very small churn rate (long lifespan)', () => {
    const { ltv, averageLifespanMonths } = computeLtv(2900, 0.01);
    // lifespan = 100 months, LTV = 290000
    expect(ltv).toBe(290000);
    expect(averageLifespanMonths).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeGrowthRate
// ---------------------------------------------------------------------------
describe('computeGrowthRate', () => {
  it('computes positive growth', () => {
    expect(computeGrowthRate(120, 100)).toBe(20);
  });

  it('computes negative growth', () => {
    expect(computeGrowthRate(80, 100)).toBe(-20);
  });

  it('returns 100 when previous is zero and current is positive', () => {
    expect(computeGrowthRate(50, 0)).toBe(100);
  });

  it('returns 0 when both are zero', () => {
    expect(computeGrowthRate(0, 0)).toBe(0);
  });

  it('computes 100% growth (doubling)', () => {
    expect(computeGrowthRate(200, 100)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeNrr
// ---------------------------------------------------------------------------
describe('computeNrr', () => {
  it('computes NRR > 100% with expansion', () => {
    // starting 10000, churn 500, expansion 2000, contraction 200
    // ending = 10000 + 2000 - 500 - 200 = 11300
    // nrr = 11300 / 10000 * 100 = 113%
    const { nrr, endingMrr } = computeNrr(10000, 500, 2000, 200);
    expect(nrr).toBe(113);
    expect(endingMrr).toBe(11300);
  });

  it('computes NRR < 100% with dominant churn', () => {
    // starting 10000, churn 3000, expansion 500, contraction 1000
    // ending = 10000 + 500 - 3000 - 1000 = 6500
    // nrr = 6500 / 10000 * 100 = 65%
    const { nrr, endingMrr } = computeNrr(10000, 3000, 500, 1000);
    expect(nrr).toBe(65);
    expect(endingMrr).toBe(6500);
  });

  it('returns exactly 100% when nothing changes', () => {
    const { nrr } = computeNrr(10000, 0, 0, 0);
    expect(nrr).toBe(100);
  });

  it('returns 0 when starting MRR is zero', () => {
    const { nrr } = computeNrr(0, 0, 500, 0);
    expect(nrr).toBe(0);
  });

  it('handles decimal rounding to one decimal place', () => {
    // starting 10000, churn 333, expansion 0, contraction 0
    // ending = 9667, nrr = 96.67 => rounded to 96.7
    const { nrr } = computeNrr(10000, 333, 0, 0);
    expect(nrr).toBe(96.7);
  });
});
