import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StripeService } from './services/stripe.service.js';
import {
  registerRevenueTools,
  registerChurnTools,
  registerCustomerTools,
  registerFinancialTools,
  registerTransactionTools,
} from './tools/index.js';

export function createServer(stripeService: StripeService | null | undefined): McpServer {
  // Use a placeholder service if no key provided — tools will fail with auth error at runtime
  const stripe = stripeService ?? new StripeService('sk_not_configured');
  const server = new McpServer({
    name: 'mcp-stripe-bi',
    version: '0.1.0',
  });

  // Register prompts
  server.prompt(
    'saas_health_check',
    'Run a full SaaS health check — MRR, churn, LTV, ARPU, and revenue trends',
    {},
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Run a comprehensive SaaS health check using the Stripe BI tools. Follow these steps:

1. Use stripe_get_saas_dashboard for a quick overview
2. Use stripe_get_revenue_by_month to see revenue trends over the past 12 months
3. Use stripe_get_customer_segments to understand plan distribution
4. Use stripe_get_customer_cohorts to analyze retention by cohort
5. Use stripe_get_failed_payments to check payment health
6. Use stripe_get_refund_summary and stripe_get_dispute_summary to check for issues

Summarize findings with actionable recommendations.`,
          },
        },
      ],
    }),
  );

  server.prompt(
    'revenue_deep_dive',
    'Deep dive into revenue metrics — MRR breakdown, growth trends, and product performance',
    { months: z.string().optional().describe('Number of months to analyze (default: 6)') },
    ({ months }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Perform a revenue deep dive for the past ${months ?? '6'} months:

1. Use stripe_get_mrr to see current MRR breakdown
2. Use stripe_get_arr for annualized revenue
3. Use stripe_get_mrr_growth for growth rate
4. Use stripe_get_revenue_by_month for monthly trends
5. Use stripe_get_revenue_by_product for product breakdown
6. Use stripe_get_nrr for net revenue retention
7. Use stripe_get_transaction_volume for total volume

Identify growth drivers, risks, and opportunities.`,
          },
        },
      ],
    }),
  );

  // Register all tool groups
  registerRevenueTools(server, stripe);
  registerChurnTools(server, stripe);
  registerCustomerTools(server, stripe);
  registerFinancialTools(server, stripe);
  registerTransactionTools(server, stripe);

  return server;
}
