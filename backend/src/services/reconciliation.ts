import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { PaymentEscrowSnapshot, ReconciliationJob, PaymentRecord, EscrowRecord } from '../types';
import Stripe from 'stripe';
import { TransactionManager } from './transaction-manager';

export class ReconciliationService {
  constructor(
    private db: Firestore,
    private stripe: Stripe,
    private transactionManager: TransactionManager
  ) {}

  /**
   * Create a snapshot of payment-escrow state for verification
   */
  async createSnapshot(paymentId: string, escrowId: string): Promise<PaymentEscrowSnapshot> {
    try {
      const paymentDoc = await this.db.collection('payments').doc(paymentId).get();
      const escrowDoc = await this.db.collection('escrow').doc(escrowId).get();

      if (!paymentDoc.exists || !escrowDoc.exists) {
        throw new Error('Payment or escrow record not found');
      }

      const payment = paymentDoc.data() as PaymentRecord;
      const escrow = escrowDoc.data() as EscrowRecord;

      // Determine sync status
      let status: PaymentEscrowSnapshot['status'] = 'synced';
      if (payment.status === 'succeeded' && escrow.status === 'held') {
        status = 'synced';
      } else if (payment.status === 'pending' && escrow.status === 'held') {
        status = 'payment_pending';
      } else if (payment.status === 'succeeded' && escrow.status !== 'held') {
        status = 'escrow_pending';
      } else {
        status = 'mismatched';
      }

      const snapshot: PaymentEscrowSnapshot = {
        paymentId,
        escrowId,
        jobId: payment.jobId,
        status,
        paymentStatus: payment.status,
        escrowStatus: escrow.status,
        amount: payment.amount,
        currency: payment.currency,
        lastVerifiedAt: Timestamp.now(),
        reconciliationAttempts: 0,
      };

      // Store snapshot
      await this.db.collection('payment_escrow_snapshots').doc(`${paymentId}_${escrowId}`).set(snapshot);

      return snapshot;
    } catch (error) {
      console.error('[Reconciliation] Error creating snapshot:', error);
      throw error;
    }
  }

  /**
   * Reconcile a single payment-escrow pair
   * ATOMIC: Uses transaction-based reconciliation with Stripe verification
   */
  async reconcilePair(paymentId: string, escrowId: string): Promise<{
    isReconciled: boolean;
    action?: string;
    error?: string;
  }> {
    try {
      const payment = await this.db.collection('payments').doc(paymentId).get();
      const escrow = await this.db.collection('escrow').doc(escrowId).get();

      if (!payment.exists || !escrow.exists) {
        return { isReconciled: false, error: 'Payment or escrow not found' };
      }

      const paymentData = payment.data() as PaymentRecord;
      const escrowData = escrow.data() as EscrowRecord;

      // Check amount match
      if (paymentData.amount !== escrowData.amount) {
        return { isReconciled: false, error: 'Amount mismatch' };
      }

      // Check currency match
      if (paymentData.currency !== escrowData.currency) {
        return { isReconciled: false, error: 'Currency mismatch' };
      }

      // Get Stripe payment intent status
      let stripeStatus: string | null = null;
      try {
        const intent = await this.stripe.paymentIntents.retrieve(paymentData.stripePaymentIntentId);
        stripeStatus = intent.status;

        // Update payment status atomically if Stripe shows succeeded
        if (intent.status === 'succeeded' && paymentData.status === 'pending') {
          await this.transactionManager.updatePaymentStatusAtomic({
            paymentId,
            newStatus: 'succeeded',
            stripeDetails: { stripeStatus: intent.status },
          });
          paymentData.status = 'succeeded';
        }
      } catch (stripeError) {
        console.warn('[Reconciliation] Error checking Stripe status:', stripeError);
      }

      // Determine if reconciled
      const isReconciled = paymentData.status === 'succeeded' && escrowData.status === 'held';

      if (isReconciled) {
        return { isReconciled: true };
      }

      // If payment succeeded but escrow not held, try atomic fix
      if (paymentData.status === 'succeeded' && escrowData.status !== 'held') {
        const reconcileResult = await this.transactionManager.reconcilePaymentEscrowAtomic({
          paymentId,
          escrowId,
          expectedStatus: 'escrow_pending',
        });

        if (reconcileResult.success) {
          return { isReconciled: true, action: reconcileResult.action || 'fixed_escrow' };
        }
      }

      return { isReconciled: false, error: 'Status mismatch' };
    } catch (error) {
      console.error('[Reconciliation] Error reconciling pair:', error);
      return {
        isReconciled: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run full reconciliation job
   */
  async runReconciliationJob(): Promise<ReconciliationJob> {
    const jobId = this.db.collection('reconciliation_jobs').doc().id;
    const startTime = Timestamp.now();

    const jobRecord: ReconciliationJob = {
      id: jobId,
      startTime,
      status: 'running',
      totalProcessed: 0,
      totalMismatches: 0,
      totalRecoveries: 0,
      errors: [],
      metadata: {},
    };

    const jobRef = this.db.collection('reconciliation_jobs').doc(jobId);
    await jobRef.set(jobRecord);

    try {
      // Find all payment-escrow pairs that need reconciliation
      const snapshots = await this.db
        .collection('payment_escrow_snapshots')
        .where('status', 'in', ['payment_pending', 'escrow_pending', 'mismatched'])
        .limit(100)
        .get();

      let processed = 0;
      let mismatches = 0;
      let recoveries = 0;
      const errors: ReconciliationJob['errors'] = [];

      // Process each pair
      for (const snap of snapshots.docs) {
        const snapshot = snap.data() as PaymentEscrowSnapshot;

        try {
          const result = await this.reconcilePair(snapshot.paymentId, snapshot.escrowId);
          processed++;

          if (!result.isReconciled) {
            mismatches++;
            errors.push({
              paymentId: snapshot.paymentId,
              escrowId: snapshot.escrowId,
              error: result.error || 'Unknown mismatch',
              timestamp: Timestamp.now(),
            });
          } else {
            recoveries++;

            // Update snapshot
            await this.db
              .collection('payment_escrow_snapshots')
              .doc(`${snapshot.paymentId}_${snapshot.escrowId}`)
              .update({
                status: 'synced',
                lastVerifiedAt: Timestamp.now(),
                reconciliationAttempts: snapshot.reconciliationAttempts + 1,
              });
          }
        } catch (error) {
          processed++;
          errors.push({
            paymentId: snapshot.paymentId,
            escrowId: snapshot.escrowId || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Timestamp.now(),
          });
        }
      }

      // Update job with results
      const completedJob: ReconciliationJob = {
        id: jobId,
        startTime,
        endTime: Timestamp.now(),
        status: 'completed',
        totalProcessed: processed,
        totalMismatches: mismatches,
        totalRecoveries: recoveries,
        errors,
        metadata: { snapshotsProcessed: snapshots.size },
      };

      await jobRef.update({
        endTime: completedJob.endTime,
        status: 'completed',
        totalProcessed: processed,
        totalMismatches: mismatches,
        totalRecoveries: recoveries,
        errors,
      });

      console.log(`[Reconciliation] Job ${jobId} completed: ${processed} processed, ${recoveries} recovered, ${mismatches} mismatches`);

      return completedJob;
    } catch (error) {
      console.error('[Reconciliation] Job failed:', error);

      await jobRef.update({
        status: 'failed',
        endTime: Timestamp.now(),
        errors: [
          {
            paymentId: 'job_level',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Timestamp.now(),
          },
        ],
      });

      throw error;
    }
  }

  /**
   * Get recent reconciliation jobs
   */
  async getRecentJobs(limit: number = 10): Promise<ReconciliationJob[]> {
    try {
      const snapshot = await this.db
        .collection('reconciliation_jobs')
        .orderBy('startTime', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => doc.data() as ReconciliationJob);
    } catch (error) {
      console.error('[Reconciliation] Error getting jobs:', error);
      throw error;
    }
  }
}
