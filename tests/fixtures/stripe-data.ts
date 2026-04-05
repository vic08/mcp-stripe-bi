import { vi } from 'vitest';
import type { StripeService } from '../../src/services/stripe.service.js';

// --- Mock Subscriptions ---

export const MOCK_SUBSCRIPTIONS = [
  // $29/month plan
  {
    id: 'sub_monthly_29',
    status: 'active',
    customer: 'cus_001',
    items: {
      data: [
        {
          price: {
            id: 'price_monthly_29',
            unit_amount: 2900,
            nickname: 'Starter Monthly',
            product: 'prod_starter',
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    },
  },
  // $99/month plan with quantity 2
  {
    id: 'sub_monthly_99',
    status: 'active',
    customer: 'cus_002',
    items: {
      data: [
        {
          price: {
            id: 'price_monthly_99',
            unit_amount: 9900,
            nickname: 'Pro Monthly',
            product: 'prod_pro',
            recurring: { interval: 'month', interval_count: 1 },
          },
          quantity: 2,
        },
      ],
    },
  },
  // $290/year plan (annual billing)
  {
    id: 'sub_annual_290',
    status: 'active',
    customer: 'cus_003',
    items: {
      data: [
        {
          price: {
            id: 'price_annual_290',
            unit_amount: 29000,
            nickname: 'Starter Annual',
            product: 'prod_starter',
            recurring: { interval: 'year', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
    },
  },
  // $45/quarter plan (every 3 months)
  {
    id: 'sub_quarterly_45',
    status: 'active',
    customer: 'cus_004',
    items: {
      data: [
        {
          price: {
            id: 'price_quarterly_45',
            unit_amount: 4500,
            nickname: 'Basic Quarterly',
            product: 'prod_basic',
            recurring: { interval: 'month', interval_count: 3 },
          },
          quantity: 1,
        },
      ],
    },
  },
] as any[];

// --- Mock Invoices ---

const now = Math.floor(Date.now() / 1000);

export const MOCK_INVOICES = [
  {
    id: 'in_001',
    status: 'paid',
    amount_paid: 2900,
    currency: 'usd',
    customer: 'cus_001',
    created: now - 86400 * 5,
  },
  {
    id: 'in_002',
    status: 'paid',
    amount_paid: 19800,
    currency: 'usd',
    customer: 'cus_002',
    created: now - 86400 * 10,
  },
  {
    id: 'in_003',
    status: 'paid',
    amount_paid: 29000,
    currency: 'usd',
    customer: 'cus_003',
    created: now - 86400 * 15,
  },
  {
    id: 'in_004',
    status: 'paid',
    amount_paid: 4500,
    currency: 'usd',
    customer: 'cus_004',
    created: now - 86400 * 20,
  },
  {
    id: 'in_005',
    status: 'paid',
    amount_paid: 2900,
    currency: 'usd',
    customer: 'cus_001',
    created: now - 86400 * 35,
  },
] as any[];

// --- Mock Customers ---

export const MOCK_CUSTOMERS = [
  {
    id: 'cus_001',
    email: 'alice@example.com',
    name: 'Alice',
    created: now - 86400 * 90,
    deleted: false,
  },
  {
    id: 'cus_002',
    email: 'bob@example.com',
    name: 'Bob',
    created: now - 86400 * 60,
    deleted: false,
  },
  {
    id: 'cus_003',
    email: 'carol@example.com',
    name: 'Carol',
    created: now - 86400 * 30,
    deleted: false,
  },
  {
    id: 'cus_004',
    email: 'dave@example.com',
    name: 'Dave',
    created: now - 86400 * 10,
    deleted: false,
  },
] as any[];

// --- Mock Balance ---

export const MOCK_BALANCE = {
  available: [{ amount: 125000, currency: 'usd' }],
  pending: [{ amount: 34500, currency: 'usd' }],
  livemode: true,
  object: 'balance',
} as any;

// --- Mock Stripe Service Factory ---

export function createMockStripeService(): {
  [K in keyof StripeService]: ReturnType<typeof vi.fn>;
} {
  return {
    listActiveSubscriptions: vi.fn().mockResolvedValue(MOCK_SUBSCRIPTIONS),
    listCanceledSubscriptions: vi.fn().mockResolvedValue([]),
    listAllSubscriptions: vi.fn().mockResolvedValue(MOCK_SUBSCRIPTIONS),
    listPaidInvoices: vi.fn().mockResolvedValue(MOCK_INVOICES),
    getBalance: vi.fn().mockResolvedValue(MOCK_BALANCE),
    listBalanceTransactions: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue(MOCK_CUSTOMERS),
    listCharges: vi.fn().mockResolvedValue([]),
    listRefunds: vi.fn().mockResolvedValue([]),
    listDisputes: vi.fn().mockResolvedValue([]),
    listPayouts: vi.fn().mockResolvedValue([]),
  } as any;
}
