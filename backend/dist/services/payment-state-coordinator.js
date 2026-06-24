"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentStateCoordinator = void 0;
const firestore_1 = require("firebase-admin/firestore");
const state_machine_1 = require("./state-machine");
const logger_1 = require("../utils/logger");
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
class PaymentStateCoordinator {
    constructor(db, stateMachine, guards, paymentService, escrowService, stripe) {
        this.db = db;
        this.stateMachine = stateMachine;
        this.guards = guards;
        this.paymentService = paymentService;
        this.escrowService = escrowService;
        this.stripe = stripe;
    }
    /**
     * Complete payment flow: CREATE job → FUND with payment → TRANSITION to FUNDED state
     *
     * Flow:
     * 1. Create payment with Stripe
     * 2. Hold funds in escrow (Firestore)
     * 3. Transition job to FUNDED state (via state machine with guards)
     * 4. Record immutable transition history
     */
    async fundJobWithStateTransition(params) {
        const { jobId, buyerId, freelancerId, amount, currency, title, description, userId, idempotencyKey, } = params;
        try {
            // Step 1: Get or create job record
            const jobDoc = await this.db.collection('jobs').doc(jobId).get();
            let job;
            if (!jobDoc.exists) {
                // Create job in CREATED state
                job = {
                    id: jobId,
                    jobId,
                    buyerId,
                    freelancerId,
                    amount,
                    currency,
                    state: state_machine_1.JobState.CREATED,
                    version: 1,
                    transitionHistory: {
                        [state_machine_1.JobState.CREATED]: firestore_1.Timestamp.now(),
                    },
                    lastStateChange: {
                        fromState: state_machine_1.JobState.CREATED,
                        toState: state_machine_1.JobState.CREATED,
                        timestamp: firestore_1.Timestamp.now(),
                        userId,
                    },
                    title,
                    description,
                    metadata: {},
                    createdAt: firestore_1.Timestamp.now(),
                    updatedAt: firestore_1.Timestamp.now(),
                };
                await this.db.collection('jobs').doc(jobId).set(job);
            }
            else {
                job = jobDoc.data();
                // Job must be in CREATED state to fund
                if (job.state !== state_machine_1.JobState.CREATED) {
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
            const guardCheck = await this.guards.checkTransitionGuards(job, state_machine_1.JobState.FUNDED, job.version);
            if (!guardCheck.allowed) {
                const reasons = guardCheck.reasons.join('; ');
                logger_1.logger.error('[PaymentStateCoordinator] Transition guards failed', {
                    jobId,
                    reasons,
                });
                throw new Error(`Cannot transition to FUNDED: ${reasons}`);
            }
            // Step 6: Transition to FUNDED state (via state machine)
            await this.stateMachine.transitionState({
                jobId,
                fromState: state_machine_1.JobState.CREATED,
                toState: state_machine_1.JobState.FUNDED,
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
            logger_1.logger.info('[PaymentStateCoordinator] Job funded and state transitioned', {
                jobId,
                paymentId,
                escrowId,
            });
            return { jobId, paymentId, escrowId };
        }
        catch (error) {
            logger_1.logger.error('[PaymentStateCoordinator] Error funding job with state transition', {
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
    async acceptJobWithStateTransition(params) {
        const { jobId, userId } = params;
        try {
            // Step 1: Get job
            const jobDoc = await this.db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists) {
                throw new Error(`Job not found: ${jobId}`);
            }
            const job = jobDoc.data();
            // Step 2: Verify current state is FUNDED
            if (job.state !== state_machine_1.JobState.FUNDED) {
                throw new Error(`Job must be FUNDED to accept. Current state: ${job.state}`);
            }
            // Step 3: Run acceptance guards (payment confirmed, escrow locked)
            const guardCheck = await this.guards.checkTransitionGuards(job, state_machine_1.JobState.ACCEPTED, job.version);
            if (!guardCheck.allowed) {
                const reasons = guardCheck.reasons.join('; ');
                throw new Error(`Cannot accept job: ${reasons}`);
            }
            // Step 4: Transition to ACCEPTED state
            await this.stateMachine.transitionState({
                jobId,
                fromState: state_machine_1.JobState.FUNDED,
                toState: state_machine_1.JobState.ACCEPTED,
                userId,
                reason: 'Freelancer accepted job - work can begin',
                metadata: {
                    freelancerId: job.freelancerId,
                },
            });
            logger_1.logger.info('[PaymentStateCoordinator] Job accepted and state transitioned', {
                jobId,
                freelancerId: job.freelancerId,
            });
            return { jobId };
        }
        catch (error) {
            logger_1.logger.error('[PaymentStateCoordinator] Error accepting job', {
                error,
                jobId,
            });
            throw error;
        }
    }
    /**
     * Release payment to freelancer: AI_VERIFIED → RELEASED
     *
     * CRITICAL: This is the most important guard
     * Ensures:
     * 1. Payment is confirmed
     * 2. Escrow is locked (money not elsewhere)
     * 3. Amounts match exactly
     * 4. Only happens after AI verification
     */
    async releasePaymentWithStateTransition(params) {
        const { jobId, userId, reason } = params;
        try {
            // Step 1: Get job
            const jobDoc = await this.db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists) {
                throw new Error(`Job not found: ${jobId}`);
            }
            const job = jobDoc.data();
            // Step 2: Verify current state is AI_VERIFIED
            if (job.state !== state_machine_1.JobState.AI_VERIFIED) {
                throw new Error(`Job must be AI_VERIFIED to release. Current state: ${job.state}`);
            }
            // Step 3: Run CRITICAL release guards
            // This is where Magic Handshake prevents catastrophic bugs
            const guardCheck = await this.guards.checkTransitionGuards(job, state_machine_1.JobState.RELEASED, job.version);
            if (!guardCheck.allowed) {
                const reasons = guardCheck.reasons.join('; ');
                logger_1.logger.error('[PaymentStateCoordinator] CRITICAL: Release guards failed', {
                    jobId,
                    reasons,
                    currentState: job.state,
                });
                throw new Error(`Cannot release payment: ${reasons}`);
            }
            // Step 4: Release escrow to freelancer (atomic transaction)
            await this.escrowService.releaseEscrow({
                escrowId: job.escrowRecordId,
                idempotencyKey: `${jobId}:release`,
                reason: `Job completed and verified. ${reason}`,
            });
            // Step 5: Transition to RELEASED state
            await this.stateMachine.transitionState({
                jobId,
                fromState: state_machine_1.JobState.AI_VERIFIED,
                toState: state_machine_1.JobState.RELEASED,
                userId,
                reason: `Payment released to freelancer: ${reason}`,
                metadata: {
                    escrowReleased: true,
                    amount: job.amount,
                    currency: job.currency,
                },
            });
            logger_1.logger.info('[PaymentStateCoordinator] Payment released and state transitioned', {
                jobId,
                amount: job.amount,
                currency: job.currency,
            });
            return { jobId, releasedAmount: job.amount };
        }
        catch (error) {
            logger_1.logger.error('[PaymentStateCoordinator] Error releasing payment', {
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
    async initiateDisputeWithStateTransition(params) {
        const { jobId, userId, reason } = params;
        try {
            // Step 1: Get job
            const jobDoc = await this.db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists) {
                throw new Error(`Job not found: ${jobId}`);
            }
            const job = jobDoc.data();
            // Step 2: Verify can transition to DISPUTED
            const guardCheck = await this.guards.checkTransitionGuards(job, state_machine_1.JobState.DISPUTED, job.version);
            if (!guardCheck.allowed) {
                const reasons = guardCheck.reasons.join('; ');
                throw new Error(`Cannot dispute job: ${reasons}`);
            }
            // Step 3: Transition to DISPUTED state
            await this.stateMachine.transitionState({
                jobId,
                fromState: job.state,
                toState: state_machine_1.JobState.DISPUTED,
                userId,
                reason: `Dispute initiated: ${reason}`,
                metadata: {
                    initiatedBy: userId,
                    originalState: job.state,
                },
            });
            logger_1.logger.info('[PaymentStateCoordinator] Dispute initiated and state transitioned', {
                jobId,
                initiatedBy: userId,
            });
            return { jobId };
        }
        catch (error) {
            logger_1.logger.error('[PaymentStateCoordinator] Error initiating dispute', {
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
    async cancelJobWithStateTransition(params) {
        const { jobId, userId, reason } = params;
        try {
            // Step 1: Get job
            const jobDoc = await this.db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists) {
                throw new Error(`Job not found: ${jobId}`);
            }
            const job = jobDoc.data();
            // Step 2: Verify can cancel
            const guardCheck = await this.guards.checkTransitionGuards(job, state_machine_1.JobState.CANCELLED, job.version);
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
                toState: state_machine_1.JobState.CANCELLED,
                userId,
                reason: `Job cancelled: ${reason}`,
                metadata: {
                    cancelledFrom: job.state,
                    refundedAmount: job.amount,
                },
            });
            logger_1.logger.info('[PaymentStateCoordinator] Job cancelled and escrow refunded', {
                jobId,
                refundedAmount: job.amount,
            });
            return { jobId, refundedAmount: job.amount };
        }
        catch (error) {
            logger_1.logger.error('[PaymentStateCoordinator] Error cancelling job', {
                error,
                jobId,
            });
            throw error;
        }
    }
}
exports.PaymentStateCoordinator = PaymentStateCoordinator;
