"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateMachine = exports.StateMachineService = exports.JobState = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("../firebase");
const logger_1 = require("../utils/logger");
/**
 * Job states throughout the complete workflow
 */
var JobState;
(function (JobState) {
    // Workflow states
    JobState["CREATED"] = "CREATED";
    JobState["FUNDED"] = "FUNDED";
    JobState["ACCEPTED"] = "ACCEPTED";
    JobState["IN_PROGRESS"] = "IN_PROGRESS";
    JobState["EVIDENCE_SUBMITTED"] = "EVIDENCE_SUBMITTED";
    JobState["AI_VERIFIED"] = "AI_VERIFIED";
    JobState["RELEASED"] = "RELEASED";
    // Dispute states
    JobState["DISPUTED"] = "DISPUTED";
    JobState["RESOLVED"] = "RESOLVED";
    // Terminal/error states
    JobState["CANCELLED"] = "CANCELLED";
    JobState["FAILED"] = "FAILED";
    JobState["REFUNDED"] = "REFUNDED";
})(JobState || (exports.JobState = JobState = {}));
/**
 * Centralized State Machine Service
 *
 * Responsibilities:
 * - Validate state transitions
 * - Reject invalid transitions
 * - Record transition history
 * - Emit domain events
 * - Update audit logs
 * - Enforce business rules
 */
class StateMachineService {
    constructor() {
        this.transitionRules = new Map();
        this.initializeTransitionRules();
    }
    /**
     * Define all valid state transitions
     */
    initializeTransitionRules() {
        const transitions = [
            // Normal workflow
            { from: JobState.CREATED, to: JobState.FUNDED },
            { from: JobState.FUNDED, to: JobState.ACCEPTED },
            { from: JobState.ACCEPTED, to: JobState.IN_PROGRESS },
            { from: JobState.IN_PROGRESS, to: JobState.EVIDENCE_SUBMITTED },
            { from: JobState.EVIDENCE_SUBMITTED, to: JobState.AI_VERIFIED },
            { from: JobState.AI_VERIFIED, to: JobState.RELEASED },
            // Dispute flow
            { from: JobState.IN_PROGRESS, to: JobState.DISPUTED },
            { from: JobState.EVIDENCE_SUBMITTED, to: JobState.DISPUTED },
            { from: JobState.AI_VERIFIED, to: JobState.DISPUTED },
            { from: JobState.DISPUTED, to: JobState.RESOLVED },
            { from: JobState.RESOLVED, to: JobState.RELEASED },
            // Cancellation (from early states)
            { from: JobState.CREATED, to: JobState.CANCELLED },
            { from: JobState.FUNDED, to: JobState.CANCELLED },
            { from: JobState.ACCEPTED, to: JobState.CANCELLED },
            // Error recovery
            { from: JobState.FUNDED, to: JobState.FAILED },
            { from: JobState.ACCEPTED, to: JobState.FAILED },
            { from: JobState.IN_PROGRESS, to: JobState.FAILED },
            { from: JobState.EVIDENCE_SUBMITTED, to: JobState.FAILED },
            { from: JobState.AI_VERIFIED, to: JobState.FAILED },
        ];
        // Build lookup map for O(1) transition validation
        for (const transition of transitions) {
            const key = `${transition.from}→${transition.to}`;
            if (!this.transitionRules.has(transition.from)) {
                this.transitionRules.set(transition.from, []);
            }
            this.transitionRules.get(transition.from).push(transition);
        }
        logger_1.logger.info(`[StateMachine] Initialized with ${transitions.length} valid transitions`);
    }
    /**
     * Check if a transition is valid
     */
    canTransition(fromState, toState) {
        const transitions = this.transitionRules.get(fromState) || [];
        return transitions.some((t) => t.to === toState);
    }
    /**
     * Get all valid next states for a given state
     */
    getValidNextStates(currentState) {
        const transitions = this.transitionRules.get(currentState) || [];
        return transitions.map((t) => t.to);
    }
    /**
     * Perform a state transition with full validation and logging
     */
    async transitionState(context) {
        const { jobId, fromState, toState, userId, reason, metadata } = context;
        // Validate transition is allowed
        if (!this.canTransition(fromState, toState)) {
            const error = `Invalid state transition: ${fromState} → ${toState}`;
            logger_1.logger.error(`[StateMachine] ${error}`);
            // Record failed transition
            await this.recordTransition({
                jobId,
                fromState,
                toState,
                userId,
                reason,
                metadata: metadata || {},
                success: false,
                error,
            });
            throw new Error(error);
        }
        try {
            // Get transition rules
            const transitions = this.transitionRules.get(fromState) || [];
            const transition = transitions.find((t) => t.to === toState);
            // Run custom validation if defined
            if (transition?.validate) {
                const isValid = await transition.validate(context);
                if (!isValid) {
                    throw new Error(`Transition validation failed: ${fromState} → ${toState}`);
                }
            }
            // Update job state in database
            await firebase_1.db.collection('jobs').doc(jobId).update({
                state: toState,
                previousState: fromState,
                updatedAt: firestore_1.Timestamp.now(),
                lastStateChange: {
                    fromState,
                    toState,
                    timestamp: firestore_1.Timestamp.now(),
                    userId,
                    reason,
                },
            });
            // Run custom post-transition logic if defined
            if (transition?.onTransition) {
                await transition.onTransition(context);
            }
            // Record successful transition
            await this.recordTransition({
                jobId,
                fromState,
                toState,
                userId,
                reason,
                metadata: metadata || {},
                success: true,
            });
            // Emit domain event
            await this.emitEvent({
                jobId,
                fromState,
                toState,
                eventType: `state.${fromState.toLowerCase()}.${toState.toLowerCase()}`,
                payload: {
                    reason,
                    metadata,
                    userId,
                },
            });
            logger_1.logger.info(`[StateMachine] Transition complete: ${jobId} ${fromState} → ${toState}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.logger.error(`[StateMachine] Transition failed: ${jobId} ${fromState} → ${toState}`, { error: errorMessage });
            // Record failed transition
            await this.recordTransition({
                jobId,
                fromState,
                toState,
                userId,
                reason,
                metadata: metadata || {},
                success: false,
                error: errorMessage,
            });
            throw error;
        }
    }
    /**
     * Record a transition in the audit log
     */
    async recordTransition(record) {
        try {
            const transitionId = firebase_1.db.collection('state_transitions').doc().id;
            await firebase_1.db.collection('state_transitions').doc(transitionId).set({
                ...record,
                id: transitionId,
                createdAt: firestore_1.Timestamp.now(),
            });
            // Update job's transition history
            await firebase_1.db
                .collection('jobs')
                .doc(record.jobId)
                .update({
                transitionHistory: {
                    [record.toState]: firestore_1.Timestamp.now(),
                },
            });
        }
        catch (error) {
            logger_1.logger.error(`[StateMachine] Failed to record transition for ${record.jobId}`, { error });
            // Don't throw - transition already succeeded, just log failure
        }
    }
    /**
     * Emit a domain event for the transition
     */
    async emitEvent(options) {
        try {
            const eventId = firebase_1.db.collection('domain_events').doc().id;
            await firebase_1.db.collection('domain_events').doc(eventId).set({
                id: eventId,
                jobId: options.jobId,
                type: options.eventType,
                fromState: options.fromState,
                toState: options.toState,
                payload: options.payload,
                createdAt: firestore_1.Timestamp.now(),
                processed: false,
            });
            logger_1.logger.debug(`[StateMachine] Emitted event: ${options.eventType} for job ${options.jobId}`);
        }
        catch (error) {
            logger_1.logger.error(`[StateMachine] Failed to emit event for ${options.jobId}`, { error });
            // Don't throw - transition already succeeded
        }
    }
    /**
     * Get transition history for a job
     */
    async getTransitionHistory(jobId) {
        const snapshot = await firebase_1.db
            .collection('state_transitions')
            .where('jobId', '==', jobId)
            .orderBy('createdAt', 'asc')
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    /**
     * Get domain events for a job
     */
    async getDomainEvents(jobId) {
        const snapshot = await firebase_1.db
            .collection('domain_events')
            .where('jobId', '==', jobId)
            .orderBy('createdAt', 'asc')
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    /**
     * Get current state of a job
     */
    async getJobState(jobId) {
        const doc = await firebase_1.db.collection('jobs').doc(jobId).get();
        if (!doc.exists) {
            return null;
        }
        return doc.data().state || null;
    }
    /**
     * Validate job state is consistent with related records
     */
    async validateStateConsistency(jobId) {
        const issues = [];
        try {
            const jobDoc = await firebase_1.db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists) {
                return {
                    valid: false,
                    issues: ['Job not found'],
                };
            }
            const jobState = jobDoc.data().state;
            // Validate state value
            if (!Object.values(JobState).includes(jobState)) {
                issues.push(`Invalid state value: ${jobState}`);
            }
            // Validate state matches payment status
            const paymentDocs = await firebase_1.db
                .collection('payments')
                .where('jobId', '==', jobId)
                .get();
            if (jobState === JobState.FUNDED && paymentDocs.empty) {
                issues.push('Job in FUNDED state but no payment record found');
            }
            // Validate state matches escrow status
            const escrowDocs = await firebase_1.db
                .collection('escrow')
                .where('jobId', '==', jobId)
                .get();
            if ([JobState.IN_PROGRESS, JobState.EVIDENCE_SUBMITTED, JobState.AI_VERIFIED, JobState.RELEASED].includes(jobState) &&
                escrowDocs.empty) {
                issues.push(`Job in ${jobState} state but no escrow record found`);
            }
            return {
                valid: issues.length === 0,
                issues,
            };
        }
        catch (error) {
            logger_1.logger.error(`[StateMachine] Error validating state consistency for ${jobId}`, { error });
            return {
                valid: false,
                issues: [
                    `Validation error: ${error instanceof Error ? error.message : String(error)}`,
                ],
            };
        }
    }
    /**
     * Force a state transition (admin only - use with caution)
     */
    async forceTransition(jobId, targetState, reason, userId) {
        const currentState = await this.getJobState(jobId);
        if (!currentState) {
            throw new Error(`Job ${jobId} not found`);
        }
        logger_1.logger.warn(`[StateMachine] Force transition requested: ${jobId} ${currentState} → ${targetState} (${reason})`);
        // Even forced transitions should be recorded
        await this.recordTransition({
            jobId,
            fromState: currentState,
            toState: targetState,
            userId,
            reason: `FORCED: ${reason}`,
            metadata: { forced: true },
            success: true,
        });
        // Update state in database
        await firebase_1.db.collection('jobs').doc(jobId).update({
            state: targetState,
            previousState: currentState,
            updatedAt: firestore_1.Timestamp.now(),
            lastStateChange: {
                fromState: currentState,
                toState: targetState,
                timestamp: firestore_1.Timestamp.now(),
                userId,
                reason: `FORCED: ${reason}`,
                forced: true,
            },
        });
        await this.emitEvent({
            jobId,
            fromState: currentState,
            toState: targetState,
            eventType: `state.forced.${currentState.toLowerCase()}.${targetState.toLowerCase()}`,
            payload: {
                reason,
                forced: true,
            },
        });
    }
}
exports.StateMachineService = StateMachineService;
// Export singleton instance
exports.stateMachine = new StateMachineService();
