import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, {
      maxNetworkRetries: 2,
    });
  }

  // --- Subscription methods ---

  async listActiveSubscriptions(): Promise<Stripe.Subscription[]> {
    return this.stripe.subscriptions
      .list({ status: 'active', expand: ['data.items.data.price'] })
      .autoPagingToArray({ limit: 10000 });
  }

  async listCanceledSubscriptions(since: number): Promise<Stripe.Subscription[]> {
    return this.stripe.subscriptions
      .list({
        status: 'canceled',
        created: { gte: since },
        expand: ['data.items.data.price'],
      })
      .autoPagingToArray({ limit: 10000 });
  }

  async listAllSubscriptions(since?: number): Promise<Stripe.Subscription[]> {
    const params: Stripe.SubscriptionListParams = {
      expand: ['data.items.data.price'],
    };
    if (since) params.created = { gte: since };
    return this.stripe.subscriptions.list(params).autoPagingToArray({ limit: 10000 });
  }

  // --- Invoice methods ---

  async listPaidInvoices(since: number): Promise<Stripe.Invoice[]> {
    return this.stripe.invoices
      .list({
        status: 'paid',
        created: { gte: since },
      })
      .autoPagingToArray({ limit: 10000 });
  }

  // --- Balance / transaction methods ---

  async getBalance(): Promise<Stripe.Balance> {
    return this.stripe.balance.retrieve();
  }

  async listBalanceTransactions(
    since: number,
    until?: number,
  ): Promise<Stripe.BalanceTransaction[]> {
    const params: Stripe.BalanceTransactionListParams = {
      created: { gte: since, ...(until ? { lte: until } : {}) },
    };
    return this.stripe.balanceTransactions.list(params).autoPagingToArray({ limit: 10000 });
  }

  // --- Customer methods ---

  async listCustomers(since?: number): Promise<Stripe.Customer[]> {
    const params: Stripe.CustomerListParams = {};
    if (since) params.created = { gte: since };
    return this.stripe.customers.list(params).autoPagingToArray({ limit: 10000 });
  }

  // --- Charge methods ---

  async listCharges(since: number, limit?: number): Promise<Stripe.Charge[]> {
    return this.stripe.charges
      .list({ created: { gte: since } })
      .autoPagingToArray({ limit: limit ?? 10000 });
  }

  // --- Refund methods ---

  async listRefunds(since: number): Promise<Stripe.Refund[]> {
    return this.stripe.refunds
      .list({ created: { gte: since } })
      .autoPagingToArray({ limit: 10000 });
  }

  // --- Dispute methods ---

  async listDisputes(since: number): Promise<Stripe.Dispute[]> {
    return this.stripe.disputes
      .list({ created: { gte: since } })
      .autoPagingToArray({ limit: 10000 });
  }

  // --- Payout methods ---

  async listPayouts(limit: number): Promise<Stripe.Payout[]> {
    return this.stripe.payouts.list().autoPagingToArray({ limit });
  }
}
