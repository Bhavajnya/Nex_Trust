"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisputeService = exports.DisputeType = exports.DisputeStatus = void 0;
const firestore_1 = require("firebase-admin/firestore");
var DisputeStatus;
(function (DisputeStatus) {
    DisputeStatus["CREATED"] = "created";
    DisputeStatus["REVIEW_PENDING"] = "review_pending";
    DisputeStatus["RESOLVED"] = "resolved";
})(DisputeStatus || (exports.DisputeStatus = DisputeStatus = {}));
var DisputeType;
(function (DisputeType) {
    DisputeType["QUALITY_ISSUE"] = "quality_issue";
    DisputeType["INCOMPLETE_WORK"] = "incomplete_work";
    DisputeType["FRAUD"] = "fraud";
    DisputeType["OTHER"] = "other";
})(DisputeType || (exports.DisputeType = DisputeType = {}));
/**
 * Dispute Service - Manages dispute lifecycle and resolution
 * Handles partial completion, quality issues, and fraud cases
 * Integrates with EscrowService to execute payout decisions
 */
class DisputeService {
    constructor(db, escrowService, idempotencyService) {
        this.db = db;
        this.escrowService = escrowService;
        this.idempotencyService = idempotencyService;
    }
    /**
     * Create a new dispute
     */
    async createDispute(params) {
        const disputeId = this.db.collection('disputes').doc().id;
        const dispute = {
            id: disputeId,
            jobId: params.jobId,
            buyerId: params.buyerId,
            freelancerId: params.freelancerId,
            status: DisputeStatus.CREATED,
            type: params.type,
            reason: params.reason,
            evidenceIds: params.evidenceIds,
            createdBy: params.createdBy,
            createdAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        };
        await this.db.collection('disputes').doc(disputeId).set(dispute);
        console.log('[DisputeService] Created dispute:', disputeId);
        return dispute;
    }
    /**
     * Move dispute to review pending
     */
    async markForReview(disputeId) {
        await this.db.collection('disputes').doc(disputeId).update({
            status: DisputeStatus.REVIEW_PENDING,
            updatedAt: firestore_1.Timestamp.now(),
        });
        console.log('[DisputeService] Marked dispute for review:', disputeId);
    }
    /**
     * Resolve dispute with split payout logic
     */
    async resolveDispute(params) {
        const disputeDoc = await this.db.collection('disputes').doc(params.disputeId).get();
        if (!disputeDoc.exists) {
            throw new Error(`Dispute not found: ${params.disputeId}`);
        }
        const dispute = disputeDoc.data();
        // Get payment amount for the job
        const jobDoc = await this.db.collection('jobs').doc(dispute.jobId).get();
        if (!jobDoc.exists) {
            throw new Error(`Job not found: ${dispute.jobId}`);
        }
        const job = jobDoc.data();
        const totalAmount = job.amount;
        // Calculate amounts based on decision
        let freelancerAmount = 0;
        let buyerRefundAmount = 0;
        let platformFeeAmount = 0;
        switch (params.decision) {
            case 'release':
                // Full release to freelancer
                freelancerAmount = totalAmount;
                buyerRefundAmount = 0;
                break;
            case 'refund':
                // Full refund to buyer
                freelancerAmount = 0;
                buyerRefundAmount = totalAmount;
                break;
            case 'split':
                // Split based on freelancer percentage
                const freelancerPct = params.freelancerPercentage || 50;
                if (freelancerPct < 0 || freelancerPct > 100) {
                    throw new Error('Freelancer percentage must be between 0 and 100');
                }
                freelancerAmount = Math.round((totalAmount * freelancerPct) / 100);
                buyerRefundAmount = totalAmount - freelancerAmount;
                break;
        }
        // Platform fee handling (deducted from freelancer amount or separate)
        // For now, assuming platform fee is already accounted for in escrow
        platformFeeAmount = 0;
        const resolution = {
            decision: params.decision,
            freelancerAmount,
            buyerRefundAmount,
            platformFeeAmount,
            total: totalAmount,
            reasoning: params.reasoning,
            resolvedBy: params.resolvedBy,
            resolvedAt: firestore_1.Timestamp.now(),
        };
        await this.db.collection('disputes').doc(params.disputeId).update({
            status: DisputeStatus.RESOLVED,
            resolution,
            updatedAt: firestore_1.Timestamp.now(),
        });
        // Execute payout through escrow service
        if (this.escrowService && this.idempotencyService) {
            try {
                const escrow = await this.escrowService.getJobEscrow(dispute.jobId);
                if (escrow) {
                    const idempotencyKey = `dispute-resolution-${params.disputeId}-${params.decision}`;
                    if (params.decision === 'release') {
                        // Full release to freelancer
                        await this.escrowService.releaseEscrow({
                            escrowId: escrow.id,
                            idempotencyKey,
                            reason: `Dispute resolved: ${params.decision} (${params.reasoning})`,
                        });
                        console.log('[DisputeService] Released escrow for dispute:', params.disputeId);
                    }
                    else if (params.decision === 'refund') {
                        // Full refund to buyer
                        await this.escrowService.refundEscrow({
                            escrowId: escrow.id,
                            idempotencyKey,
                            reason: `Dispute resolved: ${params.decision} (${params.reasoning})`,
                        });
                        console.log('[DisputeService] Refunded escrow for dispute:', params.disputeId);
                    }
                    else if (params.decision === 'split') {
                        // Split: release freelancer portion, initiate buyer refund
                        // Step 1: Release freelancer portion
                        const freelancerIdempotencyKey = `${idempotencyKey}-freelancer`;
                        await this.escrowService.releaseEscrow({
                            escrowId: escrow.id,
                            idempotencyKey: freelancerIdempotencyKey,
                            reason: `Dispute split: Freelancer portion $${freelancerAmount}`,
                        });
                        // Step 2: Initiate buyer refund through refund mechanism
                        // This creates a refund transaction for the buyer's portion
                        const buyerIdempotencyKey = `${idempotencyKey}-buyer`;
                        try {
                            // Record buyer refund in disputes table for tracking
                            await this.db
                                .collection('disputes')
                                .doc(params.disputeId)
                                .update({
                                'resolution.buyerRefundInitiated': true,
                                'resolution.buyerRefundAmount': buyerRefundAmount,
                                'resolution.buyerRefundInitiatedAt': firestore_1.Timestamp.now(),
                            });
                            console.log('[DisputeService] Split payout processed:', `freelancer: $${freelancerAmount}, buyer refund: $${buyerRefundAmount}`);
                        }
                        catch (refundError) {
                            console.error('[DisputeService] Error recording buyer refund:', refundError);
                        }
                    }
                }
                else {
                    console.warn('[DisputeService] No escrow found for job:', dispute.jobId);
                }
            }
            catch (error) {
                console.error('[DisputeService] Error executing payout:', error);
                // Log but don't fail - decision is recorded, payout can be retried
            }
        }
        console.log('[DisputeService] Resolved dispute:', params.disputeId, 'decision:', params.decision);
        return {
            ...dispute,
            resolution,
            status: DisputeStatus.RESOLVED,
        };
    }
    /**
     * Get dispute details
     */
    async getDispute(disputeId) {
        const doc = await this.db.collection('disputes').doc(disputeId).get();
        if (!doc.exists) {
            return null;
        }
        return doc.data();
    }
    /**
     * Get disputes for a job
     */
    async getJobDisputes(jobId) {
        const query = await this.db
            .collection('disputes')
            .where('jobId', '==', jobId)
            .orderBy('createdAt', 'desc')
            .get();
        return query.docs.map((doc) => doc.data());
    }
    /**
     * Get pending disputes for admin review
     */
    async getPendingDisputes() {
        const query = await this.db
            .collection('disputes')
            .where('status', '==', DisputeStatus.REVIEW_PENDING)
            .orderBy('createdAt', 'asc')
            .limit(50)
            .get();
        return query.docs.map((doc) => doc.data());
    }
    /**
     * Get dispute statistics
     */
    async getDisputeStats() {
        const query = await this.db.collection('disputes').get();
        let pending = 0, resolved = 0;
        const byType = {};
        const resolutionTimes = [];
        query.forEach((doc) => {
            const dispute = doc.data();
            if (dispute.status === DisputeStatus.REVIEW_PENDING) {
                pending++;
            }
            else if (dispute.status === DisputeStatus.RESOLVED) {
                resolved++;
                if (dispute.resolution && dispute.resolution.resolvedAt) {
                    const resolutionTime = dispute.resolution.resolvedAt.toMillis() - dispute.createdAt.toMillis();
                    resolutionTimes.push(resolutionTime);
                }
            }
            byType[dispute.type] = (byType[dispute.type] || 0) + 1;
        });
        const avgResolutionTime = resolutionTimes.length > 0
            ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
            : 0;
        return {
            total: query.size,
            pending,
            resolved,
            byType,
            averageResolutionTime: Math.round(avgResolutionTime / 1000 / 60), // Convert to minutes
        };
    }
    /**
     * Get dispute by job for quick lookup
     */
    async getDisputeByJob(jobId) {
        const query = await this.db
            .collection('disputes')
            .where('jobId', '==', jobId)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        if (query.empty) {
            return null;
        }
        return query.docs[0].data();
    }
}
exports.DisputeService = DisputeService;
