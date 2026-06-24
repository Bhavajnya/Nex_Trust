import { Firestore, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { PaymentRecord, TransactionLog } from '../types';
import { IdempotencyService } from './idempotency';
import { TransactionManager } from './transaction-manager';

export class PaymentService {
  constructor(
    private db: Firestore,
    private stripe: Stripe,
    private idempotency: IdempotencyService,
    private transactionManager: TransactionManager
  ) {}

  /**
   * Create a payment with idempotency and ATOMIC transaction logging
   * ATOMIC: Stripe PaymentIntent creation + Payment record + Transaction log
   */
  async createPayment(params: {
    jobId: string;
    buyerId: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ paymentId: string; stripeIntentId: string }> {
    const { jobId, buyerId, amount, currency, idempotencyKey, metadata = {} } = params;

    // Check for duplicate request
    const existing = await this.idempotency.getResult(idempotencyKey);
    if (existing.found) {
      console.log('[Payment] Idempotent request - returning cached result:', idempotencyKey);
      return existing.result as { paymentId: string; stripeIntentId: string };
    }

    try {
      // Create Stripe PaymentIntent with idempotency
      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency.toLowerCase(),
          metadata: {
            jobId,
            buyerId,
            ...metadata,
          },
          description: `Payment for job ${jobId}`,
        },
        { idempotencyKey } // Use same idempotency key for Stripe
      );

      // ATOMIC: Create payment record and transaction log in Firestore transaction
      const { paymentId, txLogId } = await this.transactionManager.createPaymentAtomic({
        jobId,
        buyerId,
        amount,
        currency,
        stripePaymentIntentId: paymentIntent.id,
        idempotencyKey,
        metadata,
      });

      const result = { paymentId, stripeIntentId: paymentIntent.id };

      // Cache the result for idempotency
      await this.idempotency.storeResult(idempotencyKey, params, result);

      console.log('[Payment] Created payment:', paymentId, 'with intent:', paymentIntent.id);
      return result;
    } catch (error) {
      console.error('[Payment] Error creating payment:', error);

      // Log failure (separate from atomic transaction)
      try {
        const failureLogId = this.db.collection('transaction_logs').doc().id;
        await this.db.collection('transaction_logs').doc(failureLogId).set({
          id: failureLogId,
          operation: 'payment_created',
          status: 'failed',
          jobId,
          details: { buyerId, amount, currency, ...metadata },
          error: error instanceof Error ? error.message : 'Unknown error',
          createdAt: Timestamp.now(),
        } as TransactionLog);
      } catch (logError) {
        console.error('[Payment] Error logging failure:', logError);
      }

      throw error;
    }
  }

  /**
   * Confirm a payment after successful Stripe charge
   * ATOMIC: Payment status update + Transaction log in single transaction
   */
  async confirmPayment(params: {
    paymentId: string;
    stripeIntentId: string;
    idempotencyKey: string;
  }): Promise<void> {
    const { paymentId, stripeIntentId, idempotencyKey } = params;

    // Check for duplicate confirmation
    const existing = await this.idempotency.getResult(idempotencyKey);
    if (existing.found) {
      console.log('[Payment] Idempotent confirmation - skipping:', idempotencyKey);
      return;
    }

    try {
      // ATOMIC: Verify payment + update status + log confirmation in transaction
      await this.transactionManager.confirmPaymentAtomic({
        paymentId,
        stripeIntentId,
      });

      // Cache result
      await this.idempotency.storeResult(idempotencyKey, params, {});

      console.log('[Payment] Confirmed payment:', paymentId);
    } catch (error) {
      console.error('[Payment] Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId: string): Promise<PaymentRecord | null> {
    try {
      const doc = await this.db.collection('payments').doc(paymentId).get();
      return doc.exists ? (doc.data() as PaymentRecord) : null;
    } catch (error) {
      console.error('[Payment] Error getting payment:', error);
      throw error;
    }
  }

  /**
   * List payments for a job
   */
  async getJobPayments(jobId: string): Promise<PaymentRecord[]> {
    try {
      const snapshot = await this.db
        .collection('payments')
        .where('jobId', '==', jobId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => doc.data() as PaymentRecord);
    } catch (error) {
      console.error('[Payment] Error getting job payments:', error);
      throw error;
    }
  }
}
