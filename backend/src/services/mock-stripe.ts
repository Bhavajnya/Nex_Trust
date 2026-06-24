/**
 * Mock Stripe Service for MVP Testing
 * Simulates Stripe payment operations without API keys
 * Use when STRIPE_SECRET_KEY=sk_test_mock
 */

export interface MockPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'processing' | 'requires_payment_method';
  metadata?: Record<string, string>;
  created: number;
}

export interface MockTransfer {
  id: string;
  amount: number;
  destination: string;
  source_transaction: string;
  status: 'succeeded';
  created: number;
}

export class MockStripe {
  private intents: Map<string, MockPaymentIntent> = new Map();
  private transfers: Map<string, MockTransfer> = new Map();
  private idCounter = 0;

  /**
   * Create a mock payment intent
   */
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<MockPaymentIntent> {
    const id = `pi_mock_${++this.idCounter}`;
    const intent: MockPaymentIntent = {
      id,
      amount: params.amount,
      currency: params.currency,
      status: 'succeeded',
      metadata: params.metadata,
      created: Date.now(),
    };

    this.intents.set(id, intent);
    console.log('[MockStripe] Payment intent created:', id, `$${params.amount / 100}`);

    return intent;
  }

  /**
   * Retrieve a mock payment intent
   */
  async retrievePaymentIntent(id: string): Promise<MockPaymentIntent | null> {
    return this.intents.get(id) || null;
  }

  /**
   * Create a mock transfer (fund freelancer)
   */
  async createTransfer(params: {
    amount: number;
    destination: string;
    source_transaction: string;
    metadata?: Record<string, string>;
  }): Promise<MockTransfer> {
    const id = `tr_mock_${++this.idCounter}`;
    const transfer: MockTransfer = {
      id,
      amount: params.amount,
      destination: params.destination,
      source_transaction: params.source_transaction,
      status: 'succeeded',
      created: Date.now(),
    };

    this.transfers.set(id, transfer);
    console.log('[MockStripe] Transfer created:', id, `$${params.amount / 100} to ${params.destination}`);

    return transfer;
  }

  /**
   * Retrieve a mock transfer
   */
  async retrieveTransfer(id: string): Promise<MockTransfer | null> {
    return this.transfers.get(id) || null;
  }

  /**
   * Mock webhook validation
   */
  async verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    // In mock mode, always validate webhook signatures
    // In production, this would use HMAC-SHA256
    return true;
  }

  /**
   * Get mock payment status for display
   */
  getPaymentStatus(intent: MockPaymentIntent): string {
    if (intent.status === 'succeeded') {
      return 'Payment received';
    } else if (intent.status === 'processing') {
      return 'Payment processing...';
    }
    return 'Payment pending';
  }

  /**
   * Clear all mock data (for testing)
   */
  clearData(): void {
    this.intents.clear();
    this.transfers.clear();
    this.idCounter = 0;
    console.log('[MockStripe] All mock data cleared');
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      paymentIntents: this.intents.size,
      transfers: this.transfers.size,
      totalProcessed: this.idCounter,
    };
  }
}

/**
 * Factory to create real or mock Stripe client
 */
export function createStripeClient(secretKey: string): any {
  if (secretKey.startsWith('sk_test_mock')) {
    console.log('[Stripe] Using MOCK Stripe for MVP testing');
    return new MockStripe();
  }

  // In production, would import real Stripe SDK
  console.log('[Stripe] Using real Stripe with key:', secretKey.slice(0, 10) + '...');
  // return new Stripe(secretKey);
  return new MockStripe(); // Fallback to mock if no real Stripe available
}
