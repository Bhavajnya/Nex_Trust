import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { JobState } from './state-machine';
import { Job, PaymentRecord, EscrowRecord } from '../types';
import { logger } from '../utils/logger';

/**
 * State Machine Transition Guards
 * 
 * Prevents invalid state transitions by enforcing consistency checks
 * between job state and related payment/escrow records.
 * 
 * These guards answer: "Is it safe to transition this job to the next state?"
 */
export class StateMachineGuards {
  constructor(private db: Firestore) {}

  /**
   * Guard: CREATED → FUNDED
   * Ensures payment has been created and charged
   */
  async canTransitionToFunded(job: Job): Promise<{ allowed: boolean; reason?: string }> {
    if (!job.paymentRecordId) {
      return { allowed: false, reason: 'No payment record found for job' };
    }

    try {
      const paymentDoc = await this.db.collection('payments').doc(job.paymentRecordId).get();
      if (!paymentDoc.exists) {
        return { allowed: false, reason: 'Payment record not found' };
      }

      const payment = paymentDoc.data() as PaymentRecord;

      // Payment must be successfully charged with Stripe
      if (payment.status !== 'succeeded') {
        return {
          allowed: false,
          reason: `Payment not yet succeeded. Current status: ${payment.status}`,
        };
      }

      // Amount and currency must match job
      if (payment.amount !== job.amount || payment.currency !== job.currency) {
        return {
          allowed: false,
          reason: 'Payment amount or currency mismatch with job',
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('[StateMachineGuards] Error checking payment for FUNDED transition', {
        error,
        jobId: job.id,
      });
      return { allowed: false, reason: 'Error validating payment record' };
    }
  }

  /**
   * Guard: FUNDED → ACCEPTED
   * Ensures payment is confirmed and escrow is locked
   */
  async canTransitionToAccepted(job: Job): Promise<{ allowed: boolean; reason?: string }> {
    if (!job.paymentRecordId) {
      return { allowed: false, reason: 'Payment record missing' };
    }

    if (!job.escrowRecordId) {
      return { allowed: false, reason: 'Escrow record missing - must be created before acceptance' };
    }

    try {
      const [paymentDoc, escrowDoc] = await Promise.all([
        this.db.collection('payments').doc(job.paymentRecordId).get(),
        this.db.collection('escrow').doc(job.escrowRecordId).get(),
      ]);

      if (!paymentDoc.exists || !escrowDoc.exists) {
        return { allowed: false, reason: 'Payment or escrow record not found' };
      }

      const payment = paymentDoc.data() as PaymentRecord;
      const escrow = escrowDoc.data() as EscrowRecord;

      // Payment must be succeeded
      if (payment.status !== 'succeeded') {
        return { allowed: false, reason: 'Payment must be succeeded before job acceptance' };
      }

      // Escrow must be held
      if (escrow.status !== 'held') {
        return {
          allowed: false,
          reason: `Escrow must be held. Current status: ${escrow.status}`,
        };
      }

      // All amounts must match
      if (payment.amount !== escrow.amount || payment.amount !== job.amount) {
        return { allowed: false, reason: 'Amount mismatch between payment, escrow, and job' };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('[StateMachineGuards] Error checking ACCEPTED transition', {
        error,
        jobId: job.id,
      });
      return { allowed: false, reason: 'Error validating payment and escrow records' };
    }
  }

  /**
   * Guard: VERIFIED → RELEASED
   * CRITICAL: Ensures payment is confirmed AND escrow is locked
   * This is where Magic Handshake is safer than normal marketplaces
   */
  async canTransitionToReleased(job: Job): Promise<{ allowed: boolean; reason?: string }> {
    if (!job.paymentRecordId) {
      return { allowed: false, reason: 'Payment record missing' };
    }

    if (!job.escrowRecordId) {
      return { allowed: false, reason: 'Escrow record missing' };
    }

    try {
      const [paymentDoc, escrowDoc] = await Promise.all([
        this.db.collection('payments').doc(job.paymentRecordId).get(),
        this.db.collection('escrow').doc(job.escrowRecordId).get(),
      ]);

      if (!paymentDoc.exists || !escrowDoc.exists) {
        return { allowed: false, reason: 'Payment or escrow record not found' };
      }

      const payment = paymentDoc.data() as PaymentRecord;
      const escrow = escrowDoc.data() as EscrowRecord;

      // CRITICAL: Payment must be confirmed
      if (payment.status !== 'succeeded') {
        return {
          allowed: false,
          reason: `Cannot release - payment not confirmed. Status: ${payment.status}`,
        };
      }

      // CRITICAL: Escrow must be locked (held or in transaction)
      if (escrow.status !== 'held') {
        return {
          allowed: false,
          reason: `Cannot release - escrow not locked. Status: ${escrow.status}`,
        };
      }

      // CRITICAL: Amounts must match exactly
      if (payment.amount !== escrow.amount) {
        return {
          allowed: false,
          reason: `Cannot release - amount mismatch. Payment: ${payment.amount}, Escrow: ${escrow.amount}`,
        };
      }

      if (payment.currency !== escrow.currency) {
        return {
          allowed: false,
          reason: `Cannot release - currency mismatch. Payment: ${payment.currency}, Escrow: ${escrow.currency}`,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('[StateMachineGuards] Error checking RELEASED transition', {
        error,
        jobId: job.id,
      });
      return { allowed: false, reason: 'Error validating payment and escrow consistency' };
    }
  }

  /**
   * Guard: Any state → DISPUTED
   * Dispute can be initiated from IN_PROGRESS, EVIDENCE_SUBMITTED, or VERIFIED
   * No special guards needed - just validate current state
   */
  async canTransitionToDisputed(
    job: Job,
    fromState: JobState
  ): Promise<{ allowed: boolean; reason?: string }> {
    const validStatesForDispute = [
      JobState.IN_PROGRESS,
      JobState.EVIDENCE_SUBMITTED,
      JobState.VERIFIED,
    ];

    if (!validStatesForDispute.includes(fromState)) {
      return {
        allowed: false,
        reason: `Cannot dispute from state ${fromState}. Valid states: ${validStatesForDispute.join(', ')}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Guard: Any state → CANCELLED
   * Cancellation only allowed from early states (before work starts)
   */
  async canTransitionToCancelled(
    job: Job,
    fromState: JobState
  ): Promise<{ allowed: boolean; reason?: string }> {
    const validStatesForCancellation = [JobState.CREATED, JobState.FUNDED, JobState.ACCEPTED];

    if (!validStatesForCancellation.includes(fromState)) {
      return {
        allowed: false,
        reason: `Cannot cancel from state ${fromState}. Only allowed before work starts.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Guard: Any state → RELEASED or CANCELLED
   * Terminal states (RELEASED, CANCELLED) cannot transition to anything
   */
  async canTransitionFromTerminal(
    currentState: JobState,
    toState: JobState
  ): Promise<{ allowed: boolean; reason?: string }> {
    const terminalStates = [JobState.RELEASED, JobState.CANCELLED, JobState.FAILED];

    if (terminalStates.includes(currentState)) {
      return {
        allowed: false,
        reason: `Cannot transition from terminal state ${currentState} to ${toState}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Guard: Optimistic locking check
   * Prevents concurrent modifications by checking version
   */
  async checkVersionLock(
    jobId: string,
    expectedVersion: number
  ): Promise<{ allowed: boolean; reason?: string; currentVersion?: number }> {
    try {
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        return { allowed: false, reason: 'Job not found' };
      }

      const job = jobDoc.data() as Job;
      if (job.version !== expectedVersion) {
        return {
          allowed: false,
          reason: `Version mismatch. Expected ${expectedVersion}, got ${job.version}. Job was modified concurrently.`,
          currentVersion: job.version,
        };
      }

      return { allowed: true, currentVersion: job.version };
    } catch (error) {
      logger.error('[StateMachineGuards] Error checking version lock', { error, jobId });
      return { allowed: false, reason: 'Error checking version lock' };
    }
  }

  /**
   * Comprehensive guard check before any transition
   * Runs all applicable guards based on the transition
   */
  async checkTransitionGuards(
    job: Job,
    toState: JobState,
    expectedVersion: number
  ): Promise<{ allowed: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    // Always check: not from terminal state
    const terminalCheck = await this.canTransitionFromTerminal(job.state, toState);
    if (!terminalCheck.allowed) {
      reasons.push(terminalCheck.reason || 'Unknown error');
      return { allowed: false, reasons };
    }

    // Always check: version lock (prevent concurrent modifications)
    const versionCheck = await this.checkVersionLock(job.id, expectedVersion);
    if (!versionCheck.allowed) {
      reasons.push(versionCheck.reason || 'Unknown error');
      return { allowed: false, reasons };
    }

    // State-specific guards
    if (toState === JobState.FUNDED) {
      const check = await this.canTransitionToFunded(job);
      if (!check.allowed) reasons.push(check.reason || 'Unknown error');
      return { allowed: check.allowed, reasons };
    }

    if (toState === JobState.ACCEPTED) {
      const check = await this.canTransitionToAccepted(job);
      if (!check.allowed) reasons.push(check.reason || 'Unknown error');
      return { allowed: check.allowed, reasons };
    }

    if (toState === JobState.RELEASED) {
      const check = await this.canTransitionToReleased(job);
      if (!check.allowed) reasons.push(check.reason || 'Unknown error');
      return { allowed: check.allowed, reasons };
    }

    if (toState === JobState.DISPUTED) {
      const check = await this.canTransitionToDisputed(job, job.state);
      if (!check.allowed) reasons.push(check.reason || 'Unknown error');
      return { allowed: check.allowed, reasons };
    }

    if (toState === JobState.CANCELLED) {
      const check = await this.canTransitionToCancelled(job, job.state);
      if (!check.allowed) reasons.push(check.reason || 'Unknown error');
      return { allowed: check.allowed, reasons };
    }

    // All guards passed
    return { allowed: true, reasons: [] };
  }
}
