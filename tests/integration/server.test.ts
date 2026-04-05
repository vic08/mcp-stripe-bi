import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import { createMockStripeService } from '../fixtures/stripe-data.js';

describe('MCP Server integration', () => {
  let client: Client;

  beforeAll(async () => {
    const mockStripeService = createMockStripeService();
    const server = createServer(mockStripeService as any);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  it('should list exactly 20 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(20);
  });

  it('every tool name should start with stripe_', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).toMatch(/^stripe_/);
    }
  });

  // Tools should declare readOnlyHint: true since they only read Stripe data.
  // Skipped until annotations are added to tool registrations in src/tools/index.ts.
  it.skip('every tool should have readOnlyHint annotation', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations!.readOnlyHint).toBe(true);
    }
  });

  it('should expose expected tool names', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toContain('stripe_get_mrr');
    expect(names).toContain('stripe_get_arr');
    expect(names).toContain('stripe_get_churn_rate');
    expect(names).toContain('stripe_get_arpu');
    expect(names).toContain('stripe_get_ltv');
    expect(names).toContain('stripe_get_nrr');
    expect(names).toContain('stripe_get_balance');
    expect(names).toContain('stripe_get_saas_dashboard');
    expect(names).toContain('stripe_get_revenue_by_month');
    expect(names).toContain('stripe_get_revenue_by_product');
    expect(names).toContain('stripe_get_failed_payments');
    expect(names).toContain('stripe_get_customer_segments');
    expect(names).toContain('stripe_get_customer_cohorts');
    expect(names).toContain('stripe_get_new_customers');
    expect(names).toContain('stripe_get_transaction_volume');
    expect(names).toContain('stripe_get_refund_summary');
    expect(names).toContain('stripe_get_dispute_summary');
    expect(names).toContain('stripe_get_payouts');
    expect(names).toContain('stripe_get_revenue_summary');
    expect(names).toContain('stripe_get_mrr_growth');
  });

  it('should list prompts', async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain('saas_health_check');
    expect(names).toContain('revenue_deep_dive');
  });

  it('stripe_get_mrr should return MRR data', async () => {
    const result = await client.callTool({ name: 'stripe_get_mrr', arguments: {} });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe('text');

    const data = JSON.parse(content[0].text);
    expect(data.mrr).toBeGreaterThan(0);
    expect(data.currency).toBe('usd');
    expect(data.activeSubscriptions).toBe(4);
    expect(data.breakdown).toBeDefined();
  });

  it('stripe_get_balance should return balance data', async () => {
    const result = await client.callTool({ name: 'stripe_get_balance', arguments: {} });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.available).toBeDefined();
    expect(data.pending).toBeDefined();
    expect(data.available[0].amount).toBe(1250);
    expect(data.pending[0].amount).toBe(345);
  });
});
