"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowService = void 0;
const firestore_1 = require("firebase-admin/firestore");
class EscrowService {
    constructor(db, idempotency, transactionManager) {
        this.db = db;
        this.idempotency = idempotency;
        this.transactionManager = transactionManager;
    }
    /**
     * Create and hold an escrow record
     * ATOMIC: Escrow creation + Payment linkage + Transaction log in single transaction
     */
    async holdEscrow(params) {
        const { jobId, buyerId, freelancerId, amount, currency, paymentRecordId, idempotencyKey, metadata = {}, } = params;
        // Check for duplicate request
        const existing = await this.idempotency.getResult(idempotencyKey);
        if (existing.found) {
            console.log('[Escrow] Idempotent request - returning cached result:', idempotencyKey);
            return existing.result.escrowId;
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
        }
        catch (error) {
            console.error('[Escrow] Error holding escrow:', error);
            try {
                await this.db.collection('transaction_logs').doc().set({
                    operation: 'escrow_created',
                    status: 'failed',
                    jobId,
                    details: { buyerId, freelancerId, amount, currency, paymentRecordId, ...metadata },
                    error: error instanceof Error ? error.message : 'Unknown error',
                    createdAt: firestore_1.Timestamp.now(),
                });
            }
            catch (logError) {
                console.error('[Escrow] Error logging failure:', logError);
            }
            throw error;
        }
    }
    /**
     * Release escrow funds to freelancer
     * ATOMIC: Escrow status update + Transaction log in single transaction
     */
    async releaseEscrow(params) {
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
        }
        catch (error) {
            console.error('[Escrow] Error releasing escrow:', error);
            throw error;
        }
    }
    /**
     * Refund escrow back to buyer
     * ATOMIC: Escrow status update + Transaction log in single transaction
     */
    async refundEscrow(params) {
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
        }
        catch (error) {
            console.error('[Escrow] Error refunding escrow:', error);
            throw error;
        }
    }
    /**
     * Get escrow details
     */
    async getEscrow(escrowId) {
        try {
            const doc = await this.db.collection('escrow').doc(escrowId).get();
            return doc.exists ? doc.data() : null;
        }
        catch (error) {
            console.error('[Escrow] Error getting escrow:', error);
            throw error;
        }
    }
    /**
     * Get escrow for a job
     */
    async getJobEscrow(jobId) {
        try {
            const snapshot = await this.db
                .collection('escrow')
                .where('jobId', '==', jobId)
                .limit(1)
                .get();
            return snapshot.docs[0] ? snapshot.docs[0].data() : null;
        }
        catch (error) {
            console.error('[Escrow] Error getting job escrow:', error);
            throw error;
        }
    }
}
exports.EscrowService = EscrowService;
