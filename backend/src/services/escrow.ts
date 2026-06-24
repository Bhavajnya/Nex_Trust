import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { EscrowRecord, TransactionLog } from '../types';
import { IdempotencyService } from './idempotency';
import { TransactionManager } from './transaction-manager';

export class EscrowService {
  constructor(
    private db: Firestore,
    private idempotency: IdempotencyService,
    private transactionManager: TransactionManager
  ) {}

  /**
   * Create and hold an escrow record
   * ATOMIC: Escrow creation + Payment linkage + Transaction log in single transaction
   */
  async holdEscrow(params: {
    jobId: string;
    buyerId: string;
    freelancerId: string;
    amount: number;
    currency: string;
    paymentRecordId: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
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

    // Check for duplicate request
    const existing = await this.idempotency.getResult(idempotencyKey);
    if (existing.found) {
      console.log('[Escrow] Idempotent request - returning cached result:', idempotencyKey);
      return (existing.result as { escrowId: string }).escrowId;
    }

    try {
      // ATOMIC: Create escrow, link to payment, and log in transaction
      const { escrowId, txLogId } = await this.transactionManager.createEscrowAtomic({
        jobId,
        buyerId,
        freelancerId,
        amount,
        currency,
        paymentRecordId,
        idempotencyKey,
        metadata,
      });

      const result = { escrowId };
      await this.idempotency.storeResult(idempotencyKey, params, result);

      console.log('[Escrow] Created escrow:', escrowId, 'for payment:', paymentRecordId);
      return escrowId;
    } catch (error) {
      console.error('[Escrow] Error holding escrow:', error);

      try {
        await this.db.collection('transaction_logs').doc().set({
          operation: 'escrow_created',
          status: 'failed',
          jobId,
          details: { buyerId, freelancerId, amount, currency, paymentRecordId, ...metadata },
          error: error instanceof Error ? error.message : 'Unknown error',
          createdAt: Timestamp.now(),
        } as Omit<TransactionLog, 'id'>);
      } catch (logError) {
        console.error('[Escrow] Error logging failure:', logError);
      }

      throw error;
    }
  }

  /**
   * Release escrow funds to freelancer
   * ATOMIC: Escrow status update + Transaction log in single transaction
   */
  async releaseEscrow(params: {
    escrowId: string;
    idempotencyKey: string;
    reason?: string;
  }): Promise<void> {
    const { escrowId, idempotencyKey, reason = '' } = params;

    // Check for duplicate request
    const existing = await this.idempotency.getResult(idempotencyKey);
    if (existing.found) {
      console.log('[Escrow] Idempotent release - skipping:', idempotencyKey);
      return;
    }

    try {
      // ATOMIC: Verify escrow state + update status + log release in transaction
      await this.transactionManager.releaseEscrowAtomic({
        escrowId,
        reason,
      });

      await this.idempotency.storeResult(idempotencyKey, params, {});

      console.log('[Escrow] Released escrow:', escrowId);
    } catch (error) {
      console.error('[Escrow] Error releasing escrow:', error);
      throw error;
    }
  }

  /**
   * Refund escrow back to buyer
   * ATOMIC: Escrow status update + Transaction log in single transaction
   */
  async refundEscrow(params: {
    escrowId: string;
    idempotencyKey: string;
    reason?: string;
  }): Promise<void> {
    const { escrowId, idempotencyKey, reason = '' } = params;

    // Check for duplicate request
    const existing = await this.idempotency.getResult(idempotencyKey);
    if (existing.found) {
      console.log('[Escrow] Idempotent refund - skipping:', idempotencyKey);
      return;
    }

    try {
      // ATOMIC: Verify escrow state + update status + log refund in transaction
      await this.transactionManager.refundEscrowAtomic({
        escrowId,
        reason,
      });

      await this.idempotency.storeResult(idempotencyKey, params, {});

      console.log('[Escrow] Refunded escrow:', escrowId);
    } catch (error) {
      console.error('[Escrow] Error refunding escrow:', error);
      throw error;
    }
  }

  /**
   * Get escrow details
   */
  async getEscrow(escrowId: string): Promise<EscrowRecord | null> {
    try {
      const doc = await this.db.collection('escrow').doc(escrowId).get();
      return doc.exists ? (doc.data() as EscrowRecord) : null;
    } catch (error) {
      console.error('[Escrow] Error getting escrow:', error);
      throw error;
    }
  }

  /**
   * Get escrow for a job
   */
  async getJobEscrow(jobId: string): Promise<EscrowRecord | null> {
    try {
      const snapshot = await this.db
        .collection('escrow')
        .where('jobId', '==', jobId)
        .limit(1)
        .get();

      return snapshot.docs[0] ? (snapshot.docs[0].data() as EscrowRecord) : null;
    } catch (error) {
      console.error('[Escrow] Error getting job escrow:', error);
      throw error;
    }
  }
}
