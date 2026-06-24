import { Firestore, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { Job, PaymentRecord } from '../types';
import { JobState, StateMachineService } from './state-machine';
import { StateMachineGuards } from './state-machine-guards';
import { PaymentService } from './payment';
import { EscrowService } from './escrow';
import { logger } from '../utils/logger';

/**
 * Payment-State Coordinator
 * 
 * Orchestrates state transitions with payment/escrow consistency
 * Ensures job state always matches payment and escrow status
 * 
 * This is where Magic Handshake prevents catastrophic bugs:
 * - Money never leaves escrow without AI verification
 * - Job state always matches payment/escrow reality
 * - Disputes can be initiated safely even during transitions
 */
export class PaymentStateCoordinator {
  constructor(
    private db: Firestore,
    private stateMachine: StateMachineService,
    private guards: StateMachineGuards,
    private paymentService: PaymentService,
    private escrowService: EscrowService,
    private stripe: Stripe
  ) {}

  /**
   * Complete payment flow: CREATE job → FUND with payment → TRANSITION to FUNDED state
   * 
   * Flow:
   * 1. Create payment with Stripe
   * 2. Hold funds in escrow (Firestore)
   * 3. Transition job to FUNDED state (via state machine with guards)
   * 4. Record immutable transition history
   */
  async fundJobWithStateTransition(params: {
    jobId: string;
    buyerId: string;
    freelancerId: string;
    amount: number;
    currency: string;
    title: string;
    description: string;
    userId: string; // Who initiated this (buyer)
    idempotencyKey: string;
  }): Promise<{ jobId: string; paymentId: string; escrowId: string }> {
    const {
      jobId,
      buyerId,
      freelancerId,
      amount,
      currency,
      title,
      description,
      userId,
      idempotencyKey,
    } = params;

    try {
      // Step 1: Get or create job record
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      let job: Job;

      if (!jobDoc.exists) {
        // Create job in CREATED state
        job = {
          id: jobId,
          jobId,
          buyerId,
          freelancerId,
          amount,
          currency,
          state: JobState.CREATED,
          version: 1,
          transitionHistory: {
            [JobState.CREATED]: Timestamp.now(),
          },
          lastStateChange: {
            fromState: JobState.CREATED,
            toState: JobState.CREATED,
            timestamp: Timestamp.now(),
            userId,
          },
          title,
          description,
          metadata: {},
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await this.db.collection('jobs').doc(jobId).set(job);
      } else {
        job = jobDoc.data() as Job;

        // Job must be in CREATED state to fund
        if (job.state !== JobState.CREATED) {
          throw new Error(`Cannot fund job in state ${job.state}. Must be CREATED.`);
        }
      }

      // Step 2: Create payment (charges Stripe)
      const { paymentId, stripeIntentId } = await this.paymentService.createPayment({
        jobId,
        buyerId,
        amount,
        currency,
        idempotencyKey,
      });

      // Step 3: Hold escrow
      const escrowId = await this.escrowService.holdEscrow({
        jobId,
        buyerId,
        freelancerId,
        amount,
        currency,
        paymentRecordId: paymentId,
        idempotencyKey: `${idempotencyKey}:escrow`,
      });

      // Step 4: Update job with payment/escrow references
      await this.db.collection('jobs').doc(jobId).update({
        paymentRecordId: paymentId,
        escrowRecordId: escrowId,
      });

      job.paymentRecordId = paymentId;
      job.escrowRecordId = escrowId;

      // Step 5: Verify guards before transition
      const guardCheck = await this.guards.checkTransitionGuards(
        job,
        JobState.FUNDED,
        job.version
      );

      if (!guardCheck.allowed) {
        const reasons = guardCheck.reasons.join('; ');
        logger.error('[PaymentStateCoordinator] Transition guards failed', {
          jobId,
          reasons,
        });
        throw new Error(`Cannot transition to FUNDED: ${reasons}`);
      }

      // Step 6: Transition to FUNDED state (via state machine)
      await this.stateMachine.transitionState({
        jobId,
        fromState: JobState.CREATED,
        toState: JobState.FUNDED,
        userId,
        reason: 'Payment received and funds held in escrow',
        metadata: {
          paymentId,
          escrowId,
          stripeIntentId,
          amount,
          currency,
        },
      });

      logger.info('[PaymentStateCoordinator] Job funded and state transitioned', {
        jobId,
        paymentId,
        escrowId,
      });

      return { jobId, paymentId, escrowId };
    } catch (error) {
      logger.error('[PaymentStateCoordinator] Error funding job with state transition', {
        error,
        jobId,
      });
      throw error;
    }
  }

  /**
   * Accept job (freelancer accepts): FUNDED → ACCEPTED
   * 
   * Verifies:
   * 1. Payment is confirmed
   * 2. Escrow is locked
   * 3. State can transition to ACCEPTED
   */
  async acceptJobWithStateTransition(params: {
    jobId: string;
    userId: string; // Freelancer
  }): Promise<{ jobId: string }> {
    const { jobId, userId } = params;

    try {
      // Step 1: Get job
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const job = jobDoc.data() as Job;

      // Step 2: Verify current state is FUNDED
      if (job.state !== JobState.FUNDED) {
        throw new Error(
          `Job must be FUNDED to accept. Current state: ${job.state}`
        );
      }

      // Step 3: Run acceptance guards (payment confirmed, escrow locked)
      const guardCheck = await this.guards.checkTransitionGuards(
        job,
        JobState.ACCEPTED,
        job.version
      );

      if (!guardCheck.allowed) {
        const reasons = guardCheck.reasons.join('; ');
        throw new Error(`Cannot accept job: ${reasons}`);
      }

      // Step 4: Transition to ACCEPTED state
      await this.stateMachine.transitionState({
        jobId,
        fromState: JobState.FUNDED,
        toState: JobState.ACCEPTED,
        userId,
        reason: 'Freelancer accepted job - work can begin',
        metadata: {
          freelancerId: job.freelancerId,
        },
      });

      logger.info('[PaymentStateCoordinator] Job accepted and state transitioned', {
        jobId,
        freelancerId: job.freelancerId,
      });

      return { jobId };
    } catch (error) {
      logger.error('[PaymentStateCoordinator] Error accepting job', {
        error,
        jobId,
      });
      throw error;
    }
  }

  /**
   * Release payment to freelancer: VERIFIED → RELEASED
   * 
   * CRITICAL: This is the most important guard
   * Ensures:
   * 1. Payment is confirmed
   * 2. Escrow is locked (money not elsewhere)
   * 3. Amounts match exactly
   * 4. Only happens after verification
   */
  async releasePaymentWithStateTransition(params: {
    jobId: string;
    userId: string; // Admin or system
    reason: string;
  }): Promise<{ jobId: string; releasedAmount: number }> {
    const { jobId, userId, reason } = params;

    try {
      // Step 1: Get job
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const job = jobDoc.data() as Job;

      // Step 2: Verify current state is VERIFIED
      if (job.state !== JobState.VERIFIED) {
        throw new Error(
          `Job must be VERIFIED to release. Current state: ${job.state}`
        );
      }

      // Step 3: Run CRITICAL release guards
      // This is where Magic Handshake prevents catastrophic bugs
      const guardCheck = await this.guards.checkTransitionGuards(
        job,
        JobState.RELEASED,
        job.version
      );

      if (!guardCheck.allowed) {
        const reasons = guardCheck.reasons.join('; ');
        logger.error('[PaymentStateCoordinator] CRITICAL: Release guards failed', {
          jobId,
          reasons,
          currentState: job.state,
        });
        throw new Error(`Cannot release payment: ${reasons}`);
      }

      // Step 4: Release escrow to freelancer (atomic transaction)
      await this.escrowService.releaseEscrow({
        escrowId: job.escrowRecordId!,
        idempotencyKey: `${jobId}:release`,
        reason: `Job completed and verified. ${reason}`,
      });

      // Step 5: Transition to RELEASED state
      await this.stateMachine.transitionState({
        jobId,
        fromState: JobState.VERIFIED,
        toState: JobState.RELEASED,
        userId,
        reason: `Payment released to freelancer: ${reason}`,
        metadata: {
          escrowReleased: true,
          amount: job.amount,
          currency: job.currency,
        },
      });

      logger.info('[PaymentStateCoordinator] Payment released and state transitioned', {
        jobId,
        amount: job.amount,
        currency: job.currency,
      });

      return { jobId, releasedAmount: job.amount };
    } catch (error) {
      logger.error('[PaymentStateCoordinator] Error releasing payment', {
        error,
        jobId,
      });
      throw error;
    }
  }

  /**
   * Dispute a job: AI_VERIFIED → DISPUTED → RESOLVED → RELEASED
   * 
   * Ensures dispute cannot release funds directly
   * Must go through RESOLVED state first (manual review)
   */
  async initiateDisputeWithStateTransition(params: {
    jobId: string;
    userId: string; // Buyer or freelancer
    reason: string;
  }): Promise<{ jobId: string }> {
    const { jobId, userId, reason } = params;

    try {
      // Step 1: Get job
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const job = jobDoc.data() as Job;

      // Step 2: Verify can transition to DISPUTED
      const guardCheck = await this.guards.checkTransitionGuards(
        job,
        JobState.DISPUTED,
        job.version
      );

      if (!guardCheck.allowed) {
        const reasons = guardCheck.reasons.join('; ');
        throw new Error(`Cannot dispute job: ${reasons}`);
      }

      // Step 3: Transition to DISPUTED state
      await this.stateMachine.transitionState({
        jobId,
        fromState: job.state,
        toState: JobState.DISPUTED,
        userId,
        reason: `Dispute initiated: ${reason}`,
        metadata: {
          initiatedBy: userId,
          originalState: job.state,
        },
      });

      logger.info('[PaymentStateCoordinator] Dispute initiated and state transitioned', {
        jobId,
        initiatedBy: userId,
      });

      return { jobId };
    } catch (error) {
      logger.error('[PaymentStateCoordinator] Error initiating dispute', {
        error,
        jobId,
      });
      throw error;
    }
  }

  /**
   * Cancel job early: CREATED/FUNDED/ACCEPTED → CANCELLED
   * Refunds escrow back to buyer
   */
  async cancelJobWithStateTransition(params: {
    jobId: string;
    userId: string;
    reason: string;
  }): Promise<{ jobId: string; refundedAmount: number }> {
    const { jobId, userId, reason } = params;

    try {
      // Step 1: Get job
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const job = jobDoc.data() as Job;

      // Step 2: Verify can cancel
      const guardCheck = await this.guards.checkTransitionGuards(
        job,
        JobState.CANCELLED,
        job.version
      );

      if (!guardCheck.allowed) {
        const reasons = guardCheck.reasons.join('; ');
        throw new Error(`Cannot cancel job: ${reasons}`);
      }

      // Step 3: Refund escrow
      if (job.escrowRecordId) {
        await this.escrowService.refundEscrow({
          escrowId: job.escrowRecordId,
          idempotencyKey: `${jobId}:refund`,
          reason: `Job cancelled: ${reason}`,
        });
      }

      // Step 4: Transition to CANCELLED state
      await this.stateMachine.transitionState({
        jobId,
        fromState: job.state,
        toState: JobState.CANCELLED,
        userId,
        reason: `Job cancelled: ${reason}`,
        metadata: {
          cancelledFrom: job.state,
          refundedAmount: job.amount,
        },
      });

      logger.info('[PaymentStateCoordinator] Job cancelled and escrow refunded', {
        jobId,
        refundedAmount: job.amount,
      });

      return { jobId, refundedAmount: job.amount };
    } catch (error) {
      logger.error('[PaymentStateCoordinator] Error cancelling job', {
        error,
        jobId,
      });
      throw error;
    }
  }
}
