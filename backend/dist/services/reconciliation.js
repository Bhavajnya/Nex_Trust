"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationService = void 0;
const firestore_1 = require("firebase-admin/firestore");
class ReconciliationService {
    constructor(db, stripe, transactionManager) {
        this.db = db;
        this.stripe = stripe;
        this.transactionManager = transactionManager;
    }
    /**
     * Create a snapshot of payment-escrow state for verification
     */
    async createSnapshot(paymentId, escrowId) {
        try {
            const paymentDoc = await this.db.collection('payments').doc(paymentId).get();
            const escrowDoc = await this.db.collection('escrow').doc(escrowId).get();
            if (!paymentDoc.exists || !escrowDoc.exists) {
                throw new Error('Payment or escrow record not found');
            }
            const payment = paymentDoc.data();
            const escrow = escrowDoc.data();
            // Determine sync status
            let status = 'synced';
            if (payment.status === 'succeeded' && escrow.status === 'held') {
                status = 'synced';
            }
            else if (payment.status === 'pending' && escrow.status === 'held') {
                status = 'payment_pending';
            }
            else if (payment.status === 'succeeded' && escrow.status === 'pending') {
                status = 'escrow_pending';
            }
            else {
                status = 'mismatched';
            }
            const snapshot = {
                paymentId,
                escrowId,
                jobId: payment.jobId,
                status,
                paymentStatus: payment.status,
                escrowStatus: escrow.status,
                amount: payment.amount,
                currency: payment.currency,
                lastVerifiedAt: firestore_1.Timestamp.now(),
                reconciliationAttempts: 0,
            };
            // Store snapshot
            await this.db.collection('payment_escrow_snapshots').doc(`${paymentId}_${escrowId}`).set(snapshot);
            return snapshot;
        }
        catch (error) {
            console.error('[Reconciliation] Error creating snapshot:', error);
            throw error;
        }
    }
    /**
     * Reconcile a single payment-escrow pair
     * ATOMIC: Uses transaction-based reconciliation with Stripe verification
     */
    async reconcilePair(paymentId, escrowId) {
        try {
            const payment = await this.db.collection('payments').doc(paymentId).get();
            const escrow = await this.db.collection('escrow').doc(escrowId).get();
            if (!payment.exists || !escrow.exists) {
                return { isReconciled: false, error: 'Payment or escrow not found' };
            }
            const paymentData = payment.data();
            const escrowData = escrow.data();
            // Check amount match
            if (paymentData.amount !== escrowData.amount) {
                return { isReconciled: false, error: 'Amount mismatch' };
            }
            // Check currency match
            if (paymentData.currency !== escrowData.currency) {
                return { isReconciled: false, error: 'Currency mismatch' };
            }
            // Get Stripe payment intent status
            let stripeStatus = null;
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
            }
            catch (stripeError) {
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
        }
        catch (error) {
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
    async runReconciliationJob() {
        const jobId = this.db.collection('reconciliation_jobs').doc().id;
        const startTime = firestore_1.Timestamp.now();
        const jobRecord = {
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
            const errors = [];
            // Process each pair
            for (const snap of snapshots.docs) {
                const snapshot = snap.data();
                try {
                    const result = await this.reconcilePair(snapshot.paymentId, snapshot.escrowId);
                    processed++;
                    if (!result.isReconciled) {
                        mismatches++;
                        errors.push({
                            paymentId: snapshot.paymentId,
                            escrowId: snapshot.escrowId,
                            error: result.error || 'Unknown mismatch',
                            timestamp: firestore_1.Timestamp.now(),
                        });
                    }
                    else {
                        recoveries++;
                        // Update snapshot
                        await this.db
                            .collection('payment_escrow_snapshots')
                            .doc(`${snapshot.paymentId}_${snapshot.escrowId}`)
                            .update({
                            status: 'synced',
                            lastVerifiedAt: firestore_1.Timestamp.now(),
                            reconciliationAttempts: snapshot.reconciliationAttempts + 1,
                        });
                    }
                }
                catch (error) {
                    processed++;
                    errors.push({
                        paymentId: snapshot.paymentId,
                        escrowId: snapshot.escrowId || 'unknown',
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: firestore_1.Timestamp.now(),
                    });
                }
            }
            // Update job with results
            const completedJob = {
                id: jobId,
                startTime,
                endTime: firestore_1.Timestamp.now(),
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
        }
        catch (error) {
            console.error('[Reconciliation] Job failed:', error);
            await jobRef.update({
                status: 'failed',
                endTime: firestore_1.Timestamp.now(),
                errors: [
                    {
                        paymentId: 'job_level',
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: firestore_1.Timestamp.now(),
                    },
                ],
            });
            throw error;
        }
    }
    /**
     * Get recent reconciliation jobs
     */
    async getRecentJobs(limit = 10) {
        try {
            const snapshot = await this.db
                .collection('reconciliation_jobs')
                .orderBy('startTime', 'desc')
                .limit(limit)
                .get();
            return snapshot.docs.map((doc) => doc.data());
        }
        catch (error) {
            console.error('[Reconciliation] Error getting jobs:', error);
            throw error;
        }
    }
}
exports.ReconciliationService = ReconciliationService;
