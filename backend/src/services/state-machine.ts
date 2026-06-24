import { Timestamp, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../firebase';
import { logger } from '../utils/logger';

/**
 * Job states throughout the complete workflow
 */
export enum JobState {
  // Workflow states
  CREATED = 'CREATED',
  FUNDED = 'FUNDED',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  EVIDENCE_SUBMITTED = 'EVIDENCE_SUBMITTED',
  VERIFIED = 'VERIFIED',
  RELEASED = 'RELEASED',

  // Dispute states
  DISPUTED = 'DISPUTED',
  RESOLVED = 'RESOLVED',

  // Terminal/error states
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

/**
 * Represents a state transition with validation rules
 */
interface StateTransition {
  from: JobState;
  to: JobState;
  validate?: (context: TransitionContext) => Promise<boolean>;
  onTransition?: (context: TransitionContext) => Promise<void>;
}

/**
 * Context passed during state transitions
 */
export interface TransitionContext {
  jobId: string;
  fromState: JobState;
  toState: JobState;
  userId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Timestamp;
}

/**
 * Transition history entry
 */
export interface StateTransitionRecord {
  id: string;
  jobId: string;
  fromState: JobState;
  toState: JobState;
  userId: string;
  reason?: string;
  metadata: Record<string, unknown>;
  success: boolean;
  error?: string;
  createdAt: Timestamp;
}

/**
 * Domain event emitted on state transition
 */
export interface DomainEvent {
  id: string;
  jobId: string;
  type: string;
  fromState: JobState;
  toState: JobState;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
  processed: boolean;
}

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
export class StateMachineService {
  private transitionRules: Map<string, StateTransition[]> = new Map();

  constructor() {
    this.initializeTransitionRules();
  }

  /**
   * Define all valid state transitions
   */
  private initializeTransitionRules(): void {
    const transitions: StateTransition[] = [
      // Normal workflow
      { from: JobState.CREATED, to: JobState.FUNDED },
      { from: JobState.FUNDED, to: JobState.ACCEPTED },
      { from: JobState.ACCEPTED, to: JobState.IN_PROGRESS },
      { from: JobState.IN_PROGRESS, to: JobState.EVIDENCE_SUBMITTED },
      { from: JobState.EVIDENCE_SUBMITTED, to: JobState.VERIFIED },
      { from: JobState.VERIFIED, to: JobState.RELEASED },

      // Dispute flow
      { from: JobState.IN_PROGRESS, to: JobState.DISPUTED },
      { from: JobState.EVIDENCE_SUBMITTED, to: JobState.DISPUTED },
      { from: JobState.VERIFIED, to: JobState.DISPUTED },
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
      { from: JobState.VERIFIED, to: JobState.FAILED },
    ];

    // Build lookup map for O(1) transition validation
    for (const transition of transitions) {
      const key = `${transition.from}→${transition.to}`;
      if (!this.transitionRules.has(transition.from)) {
        this.transitionRules.set(transition.from, []);
      }
      this.transitionRules.get(transition.from)!.push(transition);
    }

    logger.info(
      `[StateMachine] Initialized with ${transitions.length} valid transitions`
    );
  }

  /**
   * Check if a transition is valid
   */
  canTransition(fromState: JobState, toState: JobState): boolean {
    const transitions = this.transitionRules.get(fromState) || [];
    return transitions.some((t) => t.to === toState);
  }

  /**
   * Get all valid next states for a given state
   */
  getValidNextStates(currentState: JobState): JobState[] {
    const transitions = this.transitionRules.get(currentState) || [];
    return transitions.map((t) => t.to);
  }

  /**
   * Perform a state transition with full validation and logging
   */
  async transitionState(context: TransitionContext): Promise<void> {
    const { jobId, fromState, toState, userId, reason, metadata } = context;

    // Validate transition is allowed
    if (!this.canTransition(fromState, toState)) {
      const error = `Invalid state transition: ${fromState} → ${toState}`;
      logger.error(`[StateMachine] ${error}`);
      
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
          throw new Error(
            `Transition validation failed: ${fromState} → ${toState}`
          );
        }
      }

      // Update job state in database
      await db.collection('jobs').doc(jobId).update({
        state: toState,
        previousState: fromState,
        updatedAt: Timestamp.now(),
        lastStateChange: {
          fromState,
          toState,
          timestamp: Timestamp.now(),
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

      logger.info(
        `[StateMachine] Transition complete: ${jobId} ${fromState} → ${toState}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[StateMachine] Transition failed: ${jobId} ${fromState} → ${toState}`,
        { error: errorMessage }
      );

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
  private async recordTransition(record: Omit<StateTransitionRecord, 'id' | 'createdAt'>): Promise<void> {
    try {
      const transitionId = db.collection('state_transitions').doc().id;
      await db.collection('state_transitions').doc(transitionId).set({
        ...record,
        id: transitionId,
        createdAt: Timestamp.now(),
      });

      // Update job's transition history
      await db
        .collection('jobs')
        .doc(record.jobId)
        .update({
          transitionHistory: {
            [record.toState]: Timestamp.now(),
          },
        });
    } catch (error) {
      logger.error(
        `[StateMachine] Failed to record transition for ${record.jobId}`,
        { error }
      );
      // Don't throw - transition already succeeded, just log failure
    }
  }

  /**
   * Emit a domain event for the transition
   */
  private async emitEvent(options: {
    jobId: string;
    fromState: JobState;
    toState: JobState;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      const eventId = db.collection('domain_events').doc().id;
      await db.collection('domain_events').doc(eventId).set({
        id: eventId,
        jobId: options.jobId,
        type: options.eventType,
        fromState: options.fromState,
        toState: options.toState,
        payload: options.payload,
        createdAt: Timestamp.now(),
        processed: false,
      });

      logger.debug(
        `[StateMachine] Emitted event: ${options.eventType} for job ${options.jobId}`
      );
    } catch (error) {
      logger.error(
        `[StateMachine] Failed to emit event for ${options.jobId}`,
        { error }
      );
      // Don't throw - transition already succeeded
    }
  }

  /**
   * Get transition history for a job
   */
  async getTransitionHistory(jobId: string): Promise<StateTransitionRecord[]> {
    const snapshot = await db
      .collection('state_transitions')
      .where('jobId', '==', jobId)
      .orderBy('createdAt', 'asc')
      .get();

    return snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data() as StateTransitionRecord);
  }

  /**
   * Get domain events for a job
   */
  async getDomainEvents(jobId: string): Promise<DomainEvent[]> {
    const snapshot = await db
      .collection('domain_events')
      .where('jobId', '==', jobId)
      .orderBy('createdAt', 'asc')
      .get();

    return snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data() as DomainEvent);
  }

  /**
   * Get current state of a job
   */
  async getJobState(jobId: string): Promise<JobState | null> {
    const doc = await db.collection('jobs').doc(jobId).get();
    if (!doc.exists) {
      return null;
    }
    return (doc.data() as { state?: JobState }).state || null;
  }

  /**
   * Validate job state is consistent with related records
   */
  async validateStateConsistency(jobId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const jobDoc = await db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        return {
          valid: false,
          issues: ['Job not found'],
        };
      }

      const jobState = (jobDoc.data() as { state?: JobState }).state;

      // Validate state value
      if (jobState && !Object.values(JobState).includes(jobState)) {
        issues.push(`Invalid state value: ${jobState}`);
      }

      // Validate state matches payment status
      const paymentDocs = await db
        .collection('payments')
        .where('jobId', '==', jobId)
        .get();

      if (jobState === JobState.FUNDED && paymentDocs.empty) {
        issues.push('Job in FUNDED state but no payment record found');
      }

      // Validate state matches escrow status
      const escrowDocs = await db
        .collection('escrow')
        .where('jobId', '==', jobId)
        .get();

      if (
        jobState &&
        [JobState.IN_PROGRESS, JobState.EVIDENCE_SUBMITTED, JobState.VERIFIED, JobState.RELEASED].includes(
          jobState
        ) &&
        escrowDocs.empty
      ) {
        issues.push(
          `Job in ${jobState} state but no escrow record found`
        );
      }

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      logger.error(
        `[StateMachine] Error validating state consistency for ${jobId}`,
        { error }
      );
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
  async forceTransition(
    jobId: string,
    targetState: JobState,
    reason: string,
    userId: string
  ): Promise<void> {
    const currentState = await this.getJobState(jobId);
    if (!currentState) {
      throw new Error(`Job ${jobId} not found`);
    }

    logger.warn(
      `[StateMachine] Force transition requested: ${jobId} ${currentState} → ${targetState} (${reason})`
    );

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
    await db.collection('jobs').doc(jobId).update({
      state: targetState,
      previousState: currentState,
      updatedAt: Timestamp.now(),
      lastStateChange: {
        fromState: currentState,
        toState: targetState,
        timestamp: Timestamp.now(),
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

// Export singleton instance
export const stateMachine = new StateMachineService();
