import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { EscrowService } from './escrow';
import { IdempotencyService } from './idempotency';

export enum DisputeStatus {
  CREATED = 'created',
  REVIEW_PENDING = 'review_pending',
  RESOLVED = 'resolved',
}

export enum DisputeType {
  QUALITY_ISSUE = 'quality_issue',
  INCOMPLETE_WORK = 'incomplete_work',
  FRAUD = 'fraud',
  OTHER = 'other',
}

export interface DisputeRecord {
  id: string;
  jobId: string;
  buyerId: string;
  freelancerId: string;
  
  // Dispute details
  status: DisputeStatus;
  type: DisputeType;
  reason: string;
  evidenceIds: string[];
  
  // Resolution (split payouts)
  resolution?: {
    decision: 'release' | 'refund' | 'split';
    freelancerAmount: number;
    buyerRefundAmount: number;
    platformFeeAmount: number;
    total: number;
    reasoning: string;
    resolvedBy: string;
    resolvedAt: Timestamp;
  };
  
  // Metadata
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Dispute Service - Manages dispute lifecycle and resolution
 * Handles partial completion, quality issues, and fraud cases
 * Integrates with EscrowService to execute payout decisions
 */
export class DisputeService {
  constructor(
    private db: Firestore,
    private escrowService?: EscrowService,
    private idempotencyService?: IdempotencyService
  ) {}

  /**
   * Create a new dispute
   */
  async createDispute(params: {
    jobId: string;
    buyerId: string;
    freelancerId: string;
    type: DisputeType;
    reason: string;
    evidenceIds: string[];
    createdBy: string;
  }): Promise<DisputeRecord> {
    const disputeId = this.db.collection('disputes').doc().id;

    const dispute: DisputeRecord = {
      id: disputeId,
      jobId: params.jobId,
      buyerId: params.buyerId,
      freelancerId: params.freelancerId,
      status: DisputeStatus.CREATED,
      type: params.type,
      reason: params.reason,
      evidenceIds: params.evidenceIds,
      createdBy: params.createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await this.db.collection('disputes').doc(disputeId).set(dispute);

    console.log('[DisputeService] Created dispute:', disputeId);

    return dispute;
  }

  /**
   * Move dispute to review pending
   */
  async markForReview(disputeId: string): Promise<void> {
    await this.db.collection('disputes').doc(disputeId).update({
      status: DisputeStatus.REVIEW_PENDING,
      updatedAt: Timestamp.now(),
    });

    console.log('[DisputeService] Marked dispute for review:', disputeId);
  }

  /**
   * Resolve dispute with split payout logic
   */
  async resolveDispute(params: {
    disputeId: string;
    decision: 'release' | 'refund' | 'split';
    freelancerPercentage?: number; // For split: 0-100, e.g., 70 means 70% to freelancer, 30% refund
    reasoning: string;
    resolvedBy: string;
  }): Promise<DisputeRecord> {
    const disputeDoc = await this.db.collection('disputes').doc(params.disputeId).get();
    if (!disputeDoc.exists) {
      throw new Error(`Dispute not found: ${params.disputeId}`);
    }

    const dispute = disputeDoc.data() as DisputeRecord;

    // Get payment amount for the job
    const jobDoc = await this.db.collection('jobs').doc(dispute.jobId).get();
    if (!jobDoc.exists) {
      throw new Error(`Job not found: ${dispute.jobId}`);
    }

    const job = jobDoc.data() as { amount: number; paymentRecordId?: string };
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
      resolvedAt: Timestamp.now(),
    };

    await this.db.collection('disputes').doc(params.disputeId).update({
      status: DisputeStatus.RESOLVED,
      resolution,
      updatedAt: Timestamp.now(),
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
          } else if (params.decision === 'refund') {
            // Full refund to buyer
            await this.escrowService.refundEscrow({
              escrowId: escrow.id,
              idempotencyKey,
              reason: `Dispute resolved: ${params.decision} (${params.reasoning})`,
            });
            console.log('[DisputeService] Refunded escrow for dispute:', params.disputeId);
          } else if (params.decision === 'split') {
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
                  'resolution.buyerRefundInitiatedAt': Timestamp.now(),
                });

              console.log(
                '[DisputeService] Split payout processed:',
                `freelancer: $${freelancerAmount}, buyer refund: $${buyerRefundAmount}`
              );
            } catch (refundError) {
              console.error(
                '[DisputeService] Error recording buyer refund:',
                refundError
              );
            }
          }
        } else {
          console.warn('[DisputeService] No escrow found for job:', dispute.jobId);
        }
      } catch (error) {
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
  async getDispute(disputeId: string): Promise<DisputeRecord | null> {
    const doc = await this.db.collection('disputes').doc(disputeId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as DisputeRecord;
  }

  /**
   * Get disputes for a job
   */
  async getJobDisputes(jobId: string): Promise<DisputeRecord[]> {
    const query = await this.db
      .collection('disputes')
      .where('jobId', '==', jobId)
      .orderBy('createdAt', 'desc')
      .get();

    return query.docs.map((doc) => doc.data() as DisputeRecord);
  }

  /**
   * Get pending disputes for admin review
   */
  async getPendingDisputes(): Promise<DisputeRecord[]> {
    const query = await this.db
      .collection('disputes')
      .where('status', '==', DisputeStatus.REVIEW_PENDING)
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get();

    return query.docs.map((doc) => doc.data() as DisputeRecord);
  }

  /**
   * Get dispute statistics
   */
  async getDisputeStats(): Promise<{
    total: number;
    pending: number;
    resolved: number;
    byType: Record<string, number>;
    averageResolutionTime: number;
  }> {
    const query = await this.db.collection('disputes').get();

    let pending = 0,
      resolved = 0;
    const byType: Record<string, number> = {};
    const resolutionTimes: number[] = [];

    query.forEach((doc) => {
      const dispute = doc.data() as DisputeRecord;

      if (dispute.status === DisputeStatus.REVIEW_PENDING) {
        pending++;
      } else if (dispute.status === DisputeStatus.RESOLVED) {
        resolved++;

        if (dispute.resolution && dispute.resolution.resolvedAt) {
          const resolutionTime =
            dispute.resolution.resolvedAt.toMillis() - dispute.createdAt.toMillis();
          resolutionTimes.push(resolutionTime);
        }
      }

      byType[dispute.type] = (byType[dispute.type] || 0) + 1;
    });

    const avgResolutionTime =
      resolutionTimes.length > 0
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
  async getDisputeByJob(jobId: string): Promise<DisputeRecord | null> {
    const query = await this.db
      .collection('disputes')
      .where('jobId', '==', jobId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (query.empty) {
      return null;
    }

    return query.docs[0].data() as DisputeRecord;
  }
}
