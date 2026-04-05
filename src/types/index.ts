export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface McpError {
  error: string;
  message: string;
  retryAfter?: number;
}

// --- Revenue Metrics ---

export interface MrrData {
  mrr: number;
  currency: string;
  activeSubscriptions: number;
  breakdown: {
    monthly: number;
    annual: number;
    quarterly: number;
    other: number;
  };
  asOf: string;
}

export interface ArrData {
  arr: number;
  mrr: number;
  currency: string;
  asOf: string;
}

export interface RevenueSummary {
  totalRevenue: number;
  currency: string;
  invoiceCount: number;
  averageInvoice: number;
  periodStart: string;
  periodEnd: string;
}

export interface RevenueByMonth {
  month: string;
  revenue: number;
  invoiceCount: number;
}

export interface GrowthData {
  currentMrr: number;
  previousMrr: number;
  growthRate: number;
  growthAmount: number;
  currency: string;
  currentPeriod: string;
  previousPeriod: string;
}

// --- Churn Metrics ---

export interface ChurnData {
  subscriberChurnRate: number;
  revenueChurnRate: number;
  canceledCount: number;
  activeCount: number;
  lostMrr: number;
  periodDays: number;
  currency: string;
}

export interface NrrData {
  nrr: number;
  startingMrr: number;
  churnMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  endingMrr: number;
  currency: string;
  period: string;
}

// --- Customer Metrics ---

export interface ArpuData {
  arpu: number;
  mrr: number;
  activeCustomers: number;
  currency: string;
}

export interface LtvData {
  ltv: number;
  arpu: number;
  monthlyChurnRate: number;
  averageLifespanMonths: number;
  currency: string;
}

export interface CustomerSegment {
  plan: string;
  count: number;
  mrr: number;
  arpu: number;
  percentOfRevenue: number;
}

export interface CohortRow {
  cohort: string;
  size: number;
  retention: number[];
}

// --- Financial Metrics ---

export interface BalanceData {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
}

export interface PayoutSummary {
  totalPaid: number;
  payoutCount: number;
  currency: string;
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    arrivalDate: string;
    status: string;
  }>;
}

export interface RefundSummary {
  totalRefunded: number;
  refundCount: number;
  refundRate: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
}

export interface DisputeSummary {
  totalDisputed: number;
  disputeCount: number;
  disputeRate: number;
  wonCount: number;
  lostCount: number;
  pendingCount: number;
  currency: string;
}

// --- Transaction Metrics ---

export interface TransactionVolume {
  totalVolume: number;
  transactionCount: number;
  averageTransaction: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
}

export interface RevenueByProduct {
  productId: string;
  productName: string;
  revenue: number;
  subscriptionCount: number;
  percentOfTotal: number;
}

export interface FailedPayment {
  chargeId: string;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  customerEmail: string | null;
  created: string;
}

export interface FailedPaymentSummary {
  totalFailed: number;
  failedCount: number;
  failureRate: number;
  topFailureCodes: Array<{ code: string; count: number }>;
  currency: string;
  periodStart: string;
  periodEnd: string;
}
