import type Stripe from 'stripe';

/**
 * Normalize a subscription price amount to a monthly value (in cents).
 */
export function normalizeToMonthly(
  amount: number,
  interval: string,
  intervalCount: number,
): number {
  switch (interval) {
    case 'day':
      return (amount / intervalCount) * 30;
    case 'week':
      return (amount / intervalCount) * (30 / 7);
    case 'month':
      return amount / intervalCount;
    case 'year':
      return amount / (intervalCount * 12);
    default:
      return amount; // assume monthly if unknown
  }
}

/**
 * Compute MRR from a list of active subscriptions.
 * Returns the total MRR in the smallest currency unit (cents).
 */
export function computeMrr(subscriptions: Stripe.Subscription[]): {
  mrr: number;
  breakdown: { monthly: number; annual: number; quarterly: number; other: number };
} {
  const breakdown = { monthly: 0, annual: 0, quarterly: 0, other: 0 };
  let mrr = 0;

  for (const sub of subscriptions) {
    for (const item of sub.items.data) {
      const price = item.price;
      if (!price || !price.unit_amount || !price.recurring) continue;

      const amount = price.unit_amount * (item.quantity ?? 1);
      const interval = price.recurring.interval;
      const intervalCount = price.recurring.interval_count;
      const monthlyAmount = normalizeToMonthly(amount, interval, intervalCount);

      mrr += monthlyAmount;

      if (interval === 'month' && intervalCount === 1) {
        breakdown.monthly += monthlyAmount;
      } else if (interval === 'year' && intervalCount === 1) {
        breakdown.annual += monthlyAmount;
      } else if (interval === 'month' && intervalCount === 3) {
        breakdown.quarterly += monthlyAmount;
      } else {
        breakdown.other += monthlyAmount;
      }
    }
  }

  return {
    mrr: Math.round(mrr),
    breakdown: {
      monthly: Math.round(breakdown.monthly),
      annual: Math.round(breakdown.annual),
      quarterly: Math.round(breakdown.quarterly),
      other: Math.round(breakdown.other),
    },
  };
}

/**
 * Compute subscriber and revenue churn rates.
 */
export function computeChurnRate(
  activeCount: number,
  canceledCount: number,
  lostMrr: number,
  totalMrr: number,
): { subscriberChurnRate: number; revenueChurnRate: number } {
  const totalAtStart = activeCount + canceledCount;
  const subscriberChurnRate = totalAtStart > 0 ? canceledCount / totalAtStart : 0;
  const revenueChurnRate = totalMrr > 0 ? lostMrr / (totalMrr + lostMrr) : 0;
  return { subscriberChurnRate, revenueChurnRate };
}

/**
 * Compute Average Revenue Per User.
 */
export function computeArpu(mrr: number, activeCount: number): number {
  return activeCount > 0 ? mrr / activeCount : 0;
}

/**
 * Compute Customer Lifetime Value using simple LTV = ARPU / monthly churn rate.
 */
export function computeLtv(
  arpu: number,
  monthlyChurnRate: number,
): { ltv: number; averageLifespanMonths: number } {
  if (monthlyChurnRate <= 0) {
    return { ltv: 0, averageLifespanMonths: 0 };
  }
  const averageLifespanMonths = 1 / monthlyChurnRate;
  const ltv = arpu * averageLifespanMonths;
  return {
    ltv: Math.round(ltv),
    averageLifespanMonths: Math.round(averageLifespanMonths * 10) / 10,
  };
}

/**
 * Compute growth rate as a percentage.
 */
export function computeGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Compute Net Revenue Retention (NRR).
 * NRR = (Starting MRR + Expansion - Churn - Contraction) / Starting MRR * 100
 */
export function computeNrr(
  startingMrr: number,
  churnMrr: number,
  expansionMrr: number,
  contractionMrr: number,
): { nrr: number; endingMrr: number } {
  const endingMrr = startingMrr + expansionMrr - churnMrr - contractionMrr;
  const nrr = startingMrr > 0 ? (endingMrr / startingMrr) * 100 : 0;
  return { nrr: Math.round(nrr * 10) / 10, endingMrr: Math.round(endingMrr) };
}
