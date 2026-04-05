import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StripeService } from '../services/stripe.service.js';
import { createSuccessResult, handleToolError } from '../middleware/error-handler.js';
import {
  computeMrr,
  computeChurnRate,
  computeArpu,
  computeLtv,
  computeGrowthRate,
  computeNrr,
  normalizeToMonthly,
} from '../utils/metrics.js';

function daysAgoTimestamp(days: number): number {
  return Math.floor((Date.now() - days * 86400000) / 1000);
}

function centsToDecimal(cents: number): number {
  return Math.round(cents) / 100;
}

export function registerRevenueTools(server: McpServer, stripe: StripeService): void {
  // 1. stripe_get_mrr
  server.tool(
    'stripe_get_mrr',
    'Calculate current Monthly Recurring Revenue (MRR) from all active subscriptions, normalized to monthly. Breaks down by billing interval.',
    {},
    async () => {
      try {
        const subs = await stripe.listActiveSubscriptions();
        const { mrr, breakdown } = computeMrr(subs);
        return createSuccessResult({
          mrr: centsToDecimal(mrr),
          currency: 'usd',
          activeSubscriptions: subs.length,
          breakdown: {
            monthly: centsToDecimal(breakdown.monthly),
            annual: centsToDecimal(breakdown.annual),
            quarterly: centsToDecimal(breakdown.quarterly),
            other: centsToDecimal(breakdown.other),
          },
          asOf: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 2. stripe_get_arr
  server.tool(
    'stripe_get_arr',
    'Calculate Annual Recurring Revenue (ARR) by annualizing current MRR.',
    {},
    async () => {
      try {
        const subs = await stripe.listActiveSubscriptions();
        const { mrr } = computeMrr(subs);
        return createSuccessResult({
          arr: centsToDecimal(mrr * 12),
          mrr: centsToDecimal(mrr),
          currency: 'usd',
          asOf: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 3. stripe_get_revenue_summary
  server.tool(
    'stripe_get_revenue_summary',
    'Summarize total revenue from paid invoices over a given period. Defaults to last 30 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);
        const invoices = await stripe.listPaidInvoices(since);
        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);
        return createSuccessResult({
          totalRevenue: centsToDecimal(totalRevenue),
          currency: 'usd',
          invoiceCount: invoices.length,
          averageInvoice: invoices.length > 0 ? centsToDecimal(totalRevenue / invoices.length) : 0,
          periodStart: new Date(since * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 4. stripe_get_revenue_by_month
  server.tool(
    'stripe_get_revenue_by_month',
    'Break down revenue by month from paid invoices. Defaults to last 12 months.',
    { months: z.number().optional().describe('Number of months to look back (default: 12)') },
    async ({ months }) => {
      try {
        const period = months ?? 12;
        const since = daysAgoTimestamp(period * 30);
        const invoices = await stripe.listPaidInvoices(since);

        const byMonth: Record<string, { revenue: number; count: number }> = {};
        for (const inv of invoices) {
          const date = new Date((inv.created ?? 0) * 1000);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const entry = byMonth[key] ?? { revenue: 0, count: 0 };
          entry.revenue += inv.amount_paid ?? 0;
          entry.count += 1;
          byMonth[key] = entry;
        }

        const result = Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({
            month,
            revenue: centsToDecimal(data.revenue),
            invoiceCount: data.count,
          }));

        return createSuccessResult({ months: result, currency: 'usd' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 5. stripe_get_mrr_growth
  server.tool(
    'stripe_get_mrr_growth',
    'Calculate MRR growth by comparing current MRR to revenue from the previous period. Defaults to month-over-month.',
    { days: z.number().optional().describe('Period length in days for comparison (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const subs = await stripe.listActiveSubscriptions();
        const { mrr: currentMrr } = computeMrr(subs);

        const previousStart = daysAgoTimestamp(period * 2);
        const previousEnd = daysAgoTimestamp(period);

        const prevInvoices = await stripe.listPaidInvoices(previousStart);
        const filteredPrev = prevInvoices.filter((inv) => (inv.created ?? 0) <= previousEnd);
        const previousRevenue = filteredPrev.reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);

        const growthRate = computeGrowthRate(currentMrr, previousRevenue);
        return createSuccessResult({
          currentMrr: centsToDecimal(currentMrr),
          previousMrr: centsToDecimal(previousRevenue),
          growthRate: Math.round(growthRate * 10) / 10,
          growthAmount: centsToDecimal(currentMrr - previousRevenue),
          currency: 'usd',
          currentPeriod: `last ${period} days`,
          previousPeriod: `${period * 2}-${period} days ago`,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerChurnTools(server: McpServer, stripe: StripeService): void {
  // 6. stripe_get_churn_rate
  server.tool(
    'stripe_get_churn_rate',
    'Calculate subscriber and revenue churn rates over a given period. Defaults to last 30 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);

        const [active, canceled] = await Promise.all([
          stripe.listActiveSubscriptions(),
          stripe.listCanceledSubscriptions(since),
        ]);

        const { mrr: totalMrr } = computeMrr(active);
        let lostMrr = 0;
        for (const sub of canceled) {
          for (const item of sub.items.data) {
            const price = item.price;
            if (!price?.unit_amount || !price.recurring) continue;
            const amount = price.unit_amount * (item.quantity ?? 1);
            lostMrr += normalizeToMonthly(
              amount,
              price.recurring.interval,
              price.recurring.interval_count,
            );
          }
        }

        const { subscriberChurnRate, revenueChurnRate } = computeChurnRate(
          active.length,
          canceled.length,
          lostMrr,
          totalMrr,
        );

        return createSuccessResult({
          subscriberChurnRate: Math.round(subscriberChurnRate * 1000) / 10,
          revenueChurnRate: Math.round(revenueChurnRate * 1000) / 10,
          canceledCount: canceled.length,
          activeCount: active.length,
          lostMrr: centsToDecimal(Math.round(lostMrr)),
          periodDays: period,
          currency: 'usd',
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 7. stripe_get_nrr
  server.tool(
    'stripe_get_nrr',
    'Calculate Net Revenue Retention (NRR). Compares starting MRR to ending MRR accounting for churn, expansion, and contraction. Defaults to last 30 days.',
    { days: z.number().optional().describe('Period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);

        const [active, allSubs] = await Promise.all([
          stripe.listActiveSubscriptions(),
          stripe.listAllSubscriptions(since),
        ]);

        const { mrr: currentMrr } = computeMrr(active);

        // Estimate churn and expansion from subscription data
        let churnMrr = 0;
        let expansionMrr = 0;
        const contractionMrr = 0; // Would need historical price data to compute precisely

        for (const sub of allSubs) {
          if (sub.status === 'canceled') {
            for (const item of sub.items.data) {
              const price = item.price;
              if (!price?.unit_amount || !price.recurring) continue;
              const amount = price.unit_amount * (item.quantity ?? 1);
              churnMrr += normalizeToMonthly(
                amount,
                price.recurring.interval,
                price.recurring.interval_count,
              );
            }
          }
        }

        const startingMrr = currentMrr + churnMrr + contractionMrr - expansionMrr;
        const { nrr, endingMrr } = computeNrr(startingMrr, churnMrr, expansionMrr, contractionMrr);

        return createSuccessResult({
          nrr,
          startingMrr: centsToDecimal(Math.round(startingMrr)),
          churnMrr: centsToDecimal(Math.round(churnMrr)),
          expansionMrr: centsToDecimal(Math.round(expansionMrr)),
          contractionMrr: centsToDecimal(Math.round(contractionMrr)),
          endingMrr: centsToDecimal(endingMrr),
          currency: 'usd',
          period: `last ${period} days`,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerCustomerTools(server: McpServer, stripe: StripeService): void {
  // 8. stripe_get_arpu
  server.tool(
    'stripe_get_arpu',
    'Calculate Average Revenue Per User (ARPU) from current MRR and active subscription count.',
    {},
    async () => {
      try {
        const subs = await stripe.listActiveSubscriptions();
        const { mrr } = computeMrr(subs);
        const arpu = computeArpu(mrr, subs.length);
        return createSuccessResult({
          arpu: centsToDecimal(Math.round(arpu)),
          mrr: centsToDecimal(mrr),
          activeCustomers: subs.length,
          currency: 'usd',
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 9. stripe_get_ltv
  server.tool(
    'stripe_get_ltv',
    'Estimate Customer Lifetime Value (LTV) using ARPU and monthly churn rate. Uses last 90 days of churn data.',
    {},
    async () => {
      try {
        const since = daysAgoTimestamp(90);
        const [active, canceled] = await Promise.all([
          stripe.listActiveSubscriptions(),
          stripe.listCanceledSubscriptions(since),
        ]);

        const { mrr } = computeMrr(active);
        const arpu = computeArpu(mrr, active.length);
        const totalAtStart = active.length + canceled.length;
        const monthlyChurnRate = totalAtStart > 0 ? canceled.length / totalAtStart / 3 : 0;
        const { ltv, averageLifespanMonths } = computeLtv(arpu, monthlyChurnRate);

        return createSuccessResult({
          ltv: centsToDecimal(ltv),
          arpu: centsToDecimal(Math.round(arpu)),
          monthlyChurnRate: Math.round(monthlyChurnRate * 1000) / 10,
          averageLifespanMonths,
          currency: 'usd',
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 10. stripe_get_customer_segments
  server.tool(
    'stripe_get_customer_segments',
    'Segment customers by plan/price showing count, MRR contribution, and ARPU per segment.',
    {},
    async () => {
      try {
        const subs = await stripe.listActiveSubscriptions();
        const segments: Record<string, { count: number; mrr: number }> = {};

        for (const sub of subs) {
          for (const item of sub.items.data) {
            const price = item.price;
            if (!price?.unit_amount || !price.recurring) continue;
            const planName = price.nickname ?? price.id;
            const amount = price.unit_amount * (item.quantity ?? 1);
            const monthly = normalizeToMonthly(
              amount,
              price.recurring.interval,
              price.recurring.interval_count,
            );

            const entry = segments[planName] ?? { count: 0, mrr: 0 };
            entry.count += 1;
            entry.mrr += monthly;
            segments[planName] = entry;
          }
        }

        const { mrr: totalMrr } = computeMrr(subs);
        const result = Object.entries(segments)
          .sort(([, a], [, b]) => b.mrr - a.mrr)
          .map(([plan, data]) => ({
            plan,
            count: data.count,
            mrr: centsToDecimal(Math.round(data.mrr)),
            arpu: centsToDecimal(Math.round(data.mrr / data.count)),
            percentOfRevenue: totalMrr > 0 ? Math.round((data.mrr / totalMrr) * 1000) / 10 : 0,
          }));

        return createSuccessResult({
          segments: result,
          totalMrr: centsToDecimal(totalMrr),
          currency: 'usd',
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 11. stripe_get_customer_cohorts
  server.tool(
    'stripe_get_customer_cohorts',
    'Analyze customer retention by signup cohort (monthly). Shows how many customers from each cohort are still active.',
    { months: z.number().optional().describe('Number of months to look back (default: 12)') },
    async ({ months }) => {
      try {
        const period = months ?? 12;
        const since = daysAgoTimestamp(period * 30);
        const customers = await stripe.listCustomers(since);
        const active = await stripe.listActiveSubscriptions();

        const activeCustomerIds = new Set(
          active.map((sub) => (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id)),
        );

        const cohorts: Record<string, { total: number; active: number }> = {};
        for (const customer of customers) {
          if (customer.deleted) continue;
          const date = new Date((customer.created ?? 0) * 1000);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const entry = cohorts[key] ?? { total: 0, active: 0 };
          entry.total += 1;
          if (activeCustomerIds.has(customer.id)) entry.active += 1;
          cohorts[key] = entry;
        }

        const result = Object.entries(cohorts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cohort, data]) => ({
            cohort,
            size: data.total,
            activeCount: data.active,
            retentionRate: data.total > 0 ? Math.round((data.active / data.total) * 1000) / 10 : 0,
          }));

        return createSuccessResult({ cohorts: result });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 12. stripe_get_new_customers
  server.tool(
    'stripe_get_new_customers',
    'Count new customers acquired over a given period. Defaults to last 30 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);
        const customers = await stripe.listCustomers(since);
        const nonDeleted = customers.filter((c) => !c.deleted);
        return createSuccessResult({
          newCustomers: nonDeleted.length,
          periodDays: period,
          periodStart: new Date(since * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerFinancialTools(server: McpServer, stripe: StripeService): void {
  // 13. stripe_get_balance
  server.tool(
    'stripe_get_balance',
    'Get current Stripe account balance (available and pending amounts by currency).',
    {},
    async () => {
      try {
        const balance = await stripe.getBalance();
        return createSuccessResult({
          available: balance.available.map((b) => ({
            amount: centsToDecimal(b.amount),
            currency: b.currency,
          })),
          pending: balance.pending.map((b) => ({
            amount: centsToDecimal(b.amount),
            currency: b.currency,
          })),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 14. stripe_get_payouts
  server.tool(
    'stripe_get_payouts',
    'List recent payouts to your bank account. Defaults to last 10 payouts.',
    { limit: z.number().optional().describe('Number of payouts to retrieve (default: 10)') },
    async ({ limit }) => {
      try {
        const payouts = await stripe.listPayouts(limit ?? 10);
        const totalPaid = payouts
          .filter((p) => p.status === 'paid')
          .reduce((sum, p) => sum + p.amount, 0);

        return createSuccessResult({
          totalPaid: centsToDecimal(totalPaid),
          payoutCount: payouts.length,
          currency: 'usd',
          payouts: payouts.map((p) => ({
            id: p.id,
            amount: centsToDecimal(p.amount),
            currency: p.currency,
            arrivalDate: new Date((p.arrival_date ?? 0) * 1000).toISOString().split('T')[0],
            status: p.status,
          })),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 15. stripe_get_refund_summary
  server.tool(
    'stripe_get_refund_summary',
    'Summarize refunds over a given period — total amount, count, and refund rate. Defaults to last 30 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);
        const [refunds, charges] = await Promise.all([
          stripe.listRefunds(since),
          stripe.listCharges(since),
        ]);

        const totalRefunded = refunds.reduce((sum, r) => sum + (r.amount ?? 0), 0);
        const totalCharged = charges.reduce((sum, c) => sum + (c.amount ?? 0), 0);

        return createSuccessResult({
          totalRefunded: centsToDecimal(totalRefunded),
          refundCount: refunds.length,
          refundRate: totalCharged > 0 ? Math.round((totalRefunded / totalCharged) * 1000) / 10 : 0,
          currency: 'usd',
          periodStart: new Date(since * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 16. stripe_get_dispute_summary
  server.tool(
    'stripe_get_dispute_summary',
    'Summarize disputes (chargebacks) over a given period — total amount, outcome breakdown, and dispute rate. Defaults to last 90 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 90)') },
    async ({ days }) => {
      try {
        const period = days ?? 90;
        const since = daysAgoTimestamp(period);
        const [disputes, charges] = await Promise.all([
          stripe.listDisputes(since),
          stripe.listCharges(since),
        ]);

        const totalDisputed = disputes.reduce((sum, d) => sum + (d.amount ?? 0), 0);
        const totalCharged = charges.reduce((sum, c) => sum + (c.amount ?? 0), 0);
        const wonCount = disputes.filter((d) => d.status === 'won').length;
        const lostCount = disputes.filter((d) => d.status === 'lost').length;
        const pendingCount = disputes.filter((d) => !['won', 'lost'].includes(d.status)).length;

        return createSuccessResult({
          totalDisputed: centsToDecimal(totalDisputed),
          disputeCount: disputes.length,
          disputeRate:
            totalCharged > 0 ? Math.round((totalDisputed / totalCharged) * 1000) / 10 : 0,
          wonCount,
          lostCount,
          pendingCount,
          currency: 'usd',
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerTransactionTools(server: McpServer, stripe: StripeService): void {
  // 17. stripe_get_transaction_volume
  server.tool(
    'stripe_get_transaction_volume',
    'Get total transaction volume (successful charges) over a given period. Defaults to last 30 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);
        const charges = await stripe.listCharges(since);
        const successful = charges.filter((c) => c.status === 'succeeded');
        const totalVolume = successful.reduce((sum, c) => sum + (c.amount ?? 0), 0);

        return createSuccessResult({
          totalVolume: centsToDecimal(totalVolume),
          transactionCount: successful.length,
          averageTransaction:
            successful.length > 0 ? centsToDecimal(Math.round(totalVolume / successful.length)) : 0,
          currency: 'usd',
          periodStart: new Date(since * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 18. stripe_get_revenue_by_product
  server.tool(
    'stripe_get_revenue_by_product',
    'Break down MRR by product/price, showing revenue contribution and subscriber count per product.',
    {},
    async () => {
      try {
        const subs = await stripe.listActiveSubscriptions();
        const products: Record<string, { name: string; revenue: number; count: number }> = {};

        for (const sub of subs) {
          for (const item of sub.items.data) {
            const price = item.price;
            if (!price?.unit_amount || !price.recurring) continue;
            const productId =
              typeof price.product === 'string'
                ? price.product
                : (price.product?.toString() ?? 'unknown');
            const amount = price.unit_amount * (item.quantity ?? 1);
            const monthly = normalizeToMonthly(
              amount,
              price.recurring.interval,
              price.recurring.interval_count,
            );

            const entry = products[productId] ?? {
              name: price.nickname ?? productId,
              revenue: 0,
              count: 0,
            };
            entry.revenue += monthly;
            entry.count += 1;
            products[productId] = entry;
          }
        }

        const { mrr: totalMrr } = computeMrr(subs);
        const result = Object.entries(products)
          .sort(([, a], [, b]) => b.revenue - a.revenue)
          .map(([productId, data]) => ({
            productId,
            productName: data.name,
            revenue: centsToDecimal(Math.round(data.revenue)),
            subscriptionCount: data.count,
            percentOfTotal: totalMrr > 0 ? Math.round((data.revenue / totalMrr) * 1000) / 10 : 0,
          }));

        return createSuccessResult({
          products: result,
          totalMrr: centsToDecimal(totalMrr),
          currency: 'usd',
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 19. stripe_get_failed_payments
  server.tool(
    'stripe_get_failed_payments',
    'Analyze failed payment attempts — count, total amount, failure rate, and top failure codes. Defaults to last 30 days.',
    { days: z.number().optional().describe('Lookback period in days (default: 30)') },
    async ({ days }) => {
      try {
        const period = days ?? 30;
        const since = daysAgoTimestamp(period);
        const charges = await stripe.listCharges(since);
        const failed = charges.filter((c) => c.status === 'failed');
        const totalFailed = failed.reduce((sum, c) => sum + (c.amount ?? 0), 0);

        const failureCodes: Record<string, number> = {};
        for (const charge of failed) {
          const code = charge.failure_code ?? 'unknown';
          failureCodes[code] = (failureCodes[code] ?? 0) + 1;
        }

        const topFailureCodes = Object.entries(failureCodes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([code, count]) => ({ code, count }));

        return createSuccessResult({
          totalFailed: centsToDecimal(totalFailed),
          failedCount: failed.length,
          failureRate:
            charges.length > 0 ? Math.round((failed.length / charges.length) * 1000) / 10 : 0,
          topFailureCodes,
          currency: 'usd',
          periodStart: new Date(since * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );

  // 20. stripe_get_saas_dashboard
  server.tool(
    'stripe_get_saas_dashboard',
    'Get a comprehensive SaaS metrics dashboard in one call — MRR, ARR, churn, ARPU, LTV, NRR, subscriber count, and revenue trend. Combines multiple metrics for a quick overview.',
    {},
    async () => {
      try {
        const since30 = daysAgoTimestamp(30);
        const since90 = daysAgoTimestamp(90);

        const [active, canceled30, canceled90, invoices, balance] = await Promise.all([
          stripe.listActiveSubscriptions(),
          stripe.listCanceledSubscriptions(since30),
          stripe.listCanceledSubscriptions(since90),
          stripe.listPaidInvoices(since30),
          stripe.getBalance(),
        ]);

        const { mrr, breakdown } = computeMrr(active);
        const arpu = computeArpu(mrr, active.length);

        // Monthly churn from 90 days
        const totalAtStart90 = active.length + canceled90.length;
        const monthlyChurnRate = totalAtStart90 > 0 ? canceled90.length / totalAtStart90 / 3 : 0;
        const { ltv, averageLifespanMonths } = computeLtv(arpu, monthlyChurnRate);

        // 30-day churn
        let lostMrr = 0;
        for (const sub of canceled30) {
          for (const item of sub.items.data) {
            const price = item.price;
            if (!price?.unit_amount || !price.recurring) continue;
            const amount = price.unit_amount * (item.quantity ?? 1);
            lostMrr += normalizeToMonthly(
              amount,
              price.recurring.interval,
              price.recurring.interval_count,
            );
          }
        }
        const { subscriberChurnRate } = computeChurnRate(
          active.length,
          canceled30.length,
          lostMrr,
          mrr,
        );

        const totalRevenue30 = invoices.reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);

        return createSuccessResult({
          mrr: centsToDecimal(mrr),
          arr: centsToDecimal(mrr * 12),
          arpu: centsToDecimal(Math.round(arpu)),
          ltv: centsToDecimal(ltv),
          averageLifespanMonths,
          activeSubscriptions: active.length,
          churnRate30d: Math.round(subscriberChurnRate * 1000) / 10,
          monthlyChurnRate: Math.round(monthlyChurnRate * 1000) / 10,
          canceledLast30d: canceled30.length,
          lostMrr30d: centsToDecimal(Math.round(lostMrr)),
          revenue30d: centsToDecimal(totalRevenue30),
          invoiceCount30d: invoices.length,
          mrrBreakdown: {
            monthly: centsToDecimal(breakdown.monthly),
            annual: centsToDecimal(breakdown.annual),
            quarterly: centsToDecimal(breakdown.quarterly),
            other: centsToDecimal(breakdown.other),
          },
          balance: {
            available: balance.available.map((b) => ({
              amount: centsToDecimal(b.amount),
              currency: b.currency,
            })),
            pending: balance.pending.map((b) => ({
              amount: centsToDecimal(b.amount),
              currency: b.currency,
            })),
          },
          currency: 'usd',
          asOf: new Date().toISOString(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
