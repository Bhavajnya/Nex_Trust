import { Firestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import { PaymentRecord, EscrowRecord, TransactionLog } from '../types';

/**
 * TransactionManager handles all atomic money-related operations
 * using Firestore transactions to ensure consistency
 */
export class TransactionManager {
  constructor(private db: Firestore) {}

  /**
   * ATOMIC: Create payment and transaction log in a single transaction
   * Fails entirely if any part fails - ensures consistency
   */
  async createPaymentAtomic(params: {
    jobId: string;
    buyerId: string;
    amount: number;
    currency: string;
    stripePaymentIntentId: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ paymentId: string; txLogId: string }> {
    const {
      jobId,
      buyerId,
      amount,
      currency,
      stripePaymentIntentId,
      idempotencyKey,
      metadata = {},
    } = params;

    return await this.db.runTransaction(async (transaction) => {
      // Generate IDs
      const paymentId = this.db.collection('payments').doc().id;
      const txLogId = this.db.collection('transaction_logs').doc().id;

      const paymentRef = this.db.collection('payments').doc(paymentId);
      const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

      // Create payment record
      const paymentRecord: PaymentRecord = {
        id: paymentId,
        jobId,
        buyerId,
        amount,
        currency,
        stripePaymentIntentId,
        status: 'pending',
        idempotencyKey,
        metadata,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      // Create transaction log
      const txLog: TransactionLog = {
        id: txLogId,
        operation: 'payment_created',
        status: 'completed',
        jobId,
        paymentId,
        details: { buyerId, amount, currency, stripePaymentIntentId, ...metadata },
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      // Both writes succeed or both fail (atomic)
      transaction.set(paymentRef, paymentRecord);
      transaction.set(txLogRef, txLog);

      return { paymentId, txLogId };
    });
  }

  /**
   * ATOMIC: Confirm payment and update transaction log in a single transaction
   * Read-verify-write pattern ensures no concurrent modifications
   */
  async confirmPaymentAtomic(params: {
    paymentId: string;
    stripeIntentId: string;
  }): Promise<void> {
    const { paymentId, stripeIntentId } = params;

    await this.db.runTransaction(async (transaction) => {
      const paymentRef = this.db.collection('payments').doc(paymentId);
      const paymentDoc = await transaction.get(paymentRef);

      if (!paymentDoc.exists) {
        throw new Error(`Payment not found: ${paymentId}`);
      }

      const payment = paymentDoc.data() as PaymentRecord;

      // Verify intent ID matches
      if (payment.stripePaymentIntentId !== stripeIntentId) {
        throw new Error('Stripe intent ID mismatch');
      }

      // Already confirmed (idempotent)
      if (payment.status === 'succeeded') {
        return;
      }

      // Update payment status
      transaction.update(paymentRef, {
        status: 'succeeded',
        updatedAt: Timestamp.now(),
      });

      // Log the confirmation
      const txLogId = this.db.collection('transaction_logs').doc().id;
      const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

      const confirmLog: TransactionLog = {
        id: txLogId,
        operation: 'payment_confirmed',
        status: 'completed',
        paymentId,
        jobId: payment.jobId,
        details: { stripeIntentId, previousStatus: payment.status },
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      transaction.set(txLogRef, confirmLog);
    });
  }

  /**
   * ATOMIC: Create escrow and link to payment in a single transaction
   * Ensures payment and escrow are always created together
   */
  async createEscrowAtomic(params: {
    jobId: string;
    buyerId: string;
    freelancerId: string;
    amount: number;
    currency: string;
    paymentRecordId: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ escrowId: string; txLogId: string }> {
    const {
      jobId,
      buyerId,
      freelancerId,
      amount,
      currency,
      paymentRecordId,
      idempotencyKey,
      metadata = {},
    } = params;

    return await this.db.runTransaction(async (transaction) => {
      // Verify payment exists and is in correct state
      const paymentRef = this.db.collection('payments').doc(paymentRecordId);
      const paymentDoc = await transaction.get(paymentRef);

      if (!paymentDoc.exists) {
        throw new Error(`Payment not found: ${paymentRecordId}`);
      }

      const payment = paymentDoc.data() as PaymentRecord;

      if (payment.status !== 'succeeded') {
        throw new Error(`Cannot create escrow for payment in status: ${payment.status}`);
      }

      if (payment.amount !== amount) {
        throw new Error('Escrow amount does not match payment amount');
      }

      // Generate IDs
      const escrowId = this.db.collection('escrow').doc().id;
      const txLogId = this.db.collection('transaction_logs').doc().id;

      const escrowRef = this.db.collection('escrow').doc(escrowId);
      const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

      // Create escrow record
      const escrowRecord: EscrowRecord = {
        id: escrowId,
        jobId,
        buyerId,
        freelancerId,
        amount,
        currency,
        status: 'held',
        paymentRecordId,
        idempotencyKey,
        metadata,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      // Create transaction log
      const txLog: TransactionLog = {
        id: txLogId,
        operation: 'escrow_created',
        status: 'completed',
        jobId,
        escrowId,
        paymentId: paymentRecordId,
        details: { buyerId, freelancerId, amount, currency, ...metadata },
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      // Both writes succeed or both fail (atomic)
      transaction.set(escrowRef, escrowRecord);
      transaction.set(txLogRef, txLog);

      // Link escrow back to payment
      transaction.update(paymentRef, {
        escrowId,
        updatedAt: Timestamp.now(),
      });

      return { escrowId, txLogId };
    });
  }

  /**
   * ATOMIC: Release escrow and create transaction log in a single transaction
   * Verifies state before releasing
   */
  async releaseEscrowAtomic(params: {
    escrowId: string;
    reason?: string;
  }): Promise<{ txLogId: string }> {
    const { escrowId, reason = '' } = params;

    return await this.db.runTransaction(async (transaction) => {
      const escrowRef = this.db.collection('escrow').doc(escrowId);
      const escrowDoc = await transaction.get(escrowRef);

      if (!escrowDoc.exists) {
        throw new Error(`Escrow not found: ${escrowId}`);
      }

      const escrow = escrowDoc.data() as EscrowRecord;

      // Verify state before releasing
      if (escrow.status !== 'held') {
        throw new Error(`Cannot release escrow in status: ${escrow.status}`);
      }

      // Update escrow status
      transaction.update(escrowRef, {
        status: 'released',
        updatedAt: Timestamp.now(),
      });

      // Create transaction log
      const txLogId = this.db.collection('transaction_logs').doc().id;
      const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

      const releaseLog: TransactionLog = {
        id: txLogId,
        operation: 'release',
        status: 'completed',
        escrowId,
        jobId: escrow.jobId,
        details: {
          reason,
          amount: escrow.amount,
          freelancerId: escrow.freelancerId,
          currency: escrow.currency,
        },
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      transaction.set(txLogRef, releaseLog);

      return { txLogId };
    });
  }

  /**
   * ATOMIC: Refund escrow back to buyer and create transaction log
   * Verifies state before refunding
   */
  async refundEscrowAtomic(params: {
    escrowId: string;
    reason?: string;
  }): Promise<{ txLogId: string }> {
    const { escrowId, reason = '' } = params;

    return await this.db.runTransaction(async (transaction) => {
      const escrowRef = this.db.collection('escrow').doc(escrowId);
      const escrowDoc = await transaction.get(escrowRef);

      if (!escrowDoc.exists) {
        throw new Error(`Escrow not found: ${escrowId}`);
      }

      const escrow = escrowDoc.data() as EscrowRecord;

      // Verify state before refunding
      if (escrow.status !== 'held') {
        throw new Error(`Cannot refund escrow in status: ${escrow.status}`);
      }

      // Update escrow status
      transaction.update(escrowRef, {
        status: 'refunded',
        updatedAt: Timestamp.now(),
      });

      // Create transaction log
      const txLogId = this.db.collection('transaction_logs').doc().id;
      const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

      const refundLog: TransactionLog = {
        id: txLogId,
        operation: 'refund',
        status: 'completed',
        escrowId,
        jobId: escrow.jobId,
        details: {
          reason,
          amount: escrow.amount,
          buyerId: escrow.buyerId,
          currency: escrow.currency,
        },
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      transaction.set(txLogRef, refundLog);

      return { txLogId };
    });
  }

  /**
   * ATOMIC: Update payment status after Stripe webhook notification
   * Handles multiple writes consistently
   */
  async updatePaymentStatusAtomic(params: {
    paymentId: string;
    newStatus: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    stripeDetails?: Record<string, unknown>;
  }): Promise<void> {
    const { paymentId, newStatus, stripeDetails = {} } = params;

    await this.db.runTransaction(async (transaction) => {
      const paymentRef = this.db.collection('payments').doc(paymentId);
      const paymentDoc = await transaction.get(paymentRef);

      if (!paymentDoc.exists) {
        throw new Error(`Payment not found: ${paymentId}`);
      }

      const payment = paymentDoc.data() as PaymentRecord;
      const oldStatus = payment.status;

      // Prevent invalid state transitions
      const validTransitions: Record<string, string[]> = {
        pending: ['succeeded', 'failed', 'cancelled'],
        succeeded: ['cancelled'], // Can cancel after success (for disputes)
        failed: ['pending'], // Can retry failed payments
        cancelled: [],
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
        throw new Error(
          `Invalid payment status transition: ${oldStatus} -> ${newStatus}`
        );
      }

      // Update payment
      transaction.update(paymentRef, {
        status: newStatus,
        updatedAt: Timestamp.now(),
        metadata: { ...payment.metadata, lastStatusChange: oldStatus },
      });

      // Log the status change
      const txLogId = this.db.collection('transaction_logs').doc().id;
      const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

      const statusChangeLog: TransactionLog = {
        id: txLogId,
        operation: 'payment_confirmed',
        status: 'completed',
        paymentId,
        jobId: payment.jobId,
        details: {
          oldStatus,
          newStatus,
          stripeDetails,
        },
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      transaction.set(txLogRef, statusChangeLog);
    });
  }

  /**
   * ATOMIC: Reconciliation update - verify and update both payment and escrow
   * Used by reconciliation service to fix inconsistencies
   */
  async reconcilePaymentEscrowAtomic(params: {
    paymentId: string;
    escrowId: string;
    expectedStatus: 'synced' | 'payment_pending' | 'escrow_pending' | 'mismatched';
  }): Promise<{
    success: boolean;
    action?: string;
    error?: string;
  }> {
    const { paymentId, escrowId, expectedStatus } = params;

    try {
      return await this.db.runTransaction(async (transaction) => {
        const paymentRef = this.db.collection('payments').doc(paymentId);
        const escrowRef = this.db.collection('escrow').doc(escrowId);

        const paymentDoc = await transaction.get(paymentRef);
        const escrowDoc = await transaction.get(escrowRef);

        if (!paymentDoc.exists || !escrowDoc.exists) {
          return { success: false, error: 'Payment or escrow not found' };
        }

        const payment = paymentDoc.data() as PaymentRecord;
        const escrow = escrowDoc.data() as EscrowRecord;

        // Verify amounts match
        if (payment.amount !== escrow.amount) {
          return { success: false, error: 'Amount mismatch' };
        }

        // Determine current status and fix if needed
        let currentStatus: typeof expectedStatus = 'synced';
        if (payment.status === 'succeeded' && escrow.status === 'held') {
          currentStatus = 'synced';
        } else if (payment.status === 'pending' && escrow.status === 'held') {
          currentStatus = 'payment_pending';
        } else if (payment.status === 'succeeded' && escrow.status !== 'held') {
          currentStatus = 'escrow_pending';
        } else {
          currentStatus = 'mismatched';
        }

        if (currentStatus === 'synced') {
          return { success: true, action: 'already_synced' };
        }

        // Auto-fix based on current status
        if (currentStatus === 'payment_pending' && payment.status === 'pending') {
          // Payment still pending - nothing to do yet
          return { success: false, error: 'Payment still pending' };
        }

        if (currentStatus === 'escrow_pending' && escrow.status !== 'held') {
          // Fix escrow status
          transaction.update(escrowRef, {
            status: 'held',
            updatedAt: Timestamp.now(),
          });

          // Log the fix
          const txLogId = this.db.collection('transaction_logs').doc().id;
          const txLogRef = this.db.collection('transaction_logs').doc(txLogId);

          transaction.set(txLogRef, {
            id: txLogId,
            operation: 'reconciliation',
            status: 'completed',
            paymentId,
            escrowId,
            jobId: payment.jobId,
            details: { fixed: 'escrow_status', oldStatus: escrow.status, newStatus: 'held' },
            createdAt: Timestamp.now(),
            completedAt: Timestamp.now(),
          } as TransactionLog);

          return { success: true, action: 'fixed_escrow_status' };
        }

        return { success: false, error: 'Unable to auto-fix' };
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
