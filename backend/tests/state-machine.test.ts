/**
 * State Machine Tests - Critical MVP tests
 * Tests the core job lifecycle state transitions
 * 
 * IMPORTANT: These tests validate the most critical part of Magic Handshake
 * Job lifecycle bugs here will break the entire platform
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock job lifecycle states
enum JobState {
  CREATED = 'CREATED',
  FUNDED = 'FUNDED',
  IN_PROGRESS = 'IN_PROGRESS',
  EVIDENCE_SUBMITTED = 'EVIDENCE_SUBMITTED',
  VERIFIED = 'VERIFIED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

// State transition map
const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  [JobState.CREATED]: [JobState.FUNDED, JobState.CANCELLED],
  [JobState.FUNDED]: [JobState.IN_PROGRESS, JobState.REFUNDED],
  [JobState.IN_PROGRESS]: [JobState.EVIDENCE_SUBMITTED, JobState.DISPUTED, JobState.CANCELLED],
  [JobState.EVIDENCE_SUBMITTED]: [JobState.VERIFIED, JobState.DISPUTED],
  [JobState.VERIFIED]: [JobState.RELEASED, JobState.DISPUTED],
  [JobState.RELEASED]: [], // Final state
  [JobState.DISPUTED]: [JobState.RELEASED, JobState.REFUNDED], // Dispute resolution
  [JobState.CANCELLED]: [], // Final state
  [JobState.REFUNDED]: [], // Final state
};

/**
 * Simple state machine for testing
 */
class JobStateMachine {
  private state: JobState = JobState.CREATED;
  private history: JobState[] = [JobState.CREATED];

  constructor() {
    this.state = JobState.CREATED;
  }

  getState(): JobState {
    return this.state;
  }

  canTransition(nextState: JobState): boolean {
    const allowed = VALID_TRANSITIONS[this.state];
    return allowed.includes(nextState);
  }

  async transition(nextState: JobState): Promise<void> {
    if (!this.canTransition(nextState)) {
      throw new Error(`Cannot transition from ${this.state} to ${nextState}`);
    }

    console.log(`[StateTest] Transitioning: ${this.state} -> ${nextState}`);
    this.state = nextState;
    this.history.push(nextState);
  }

  getHistory(): JobState[] {
    return [...this.history];
  }
}

// Tests
describe('Job State Machine', () => {
  let stateMachine: JobStateMachine;

  beforeEach(() => {
    stateMachine = new JobStateMachine();
  });

  describe('Happy path: Complete job lifecycle', () => {
    it('should transition: CREATED -> FUNDED -> IN_PROGRESS -> EVIDENCE_SUBMITTED -> VERIFIED -> RELEASED', async () => {
      expect(stateMachine.getState()).toBe(JobState.CREATED);

      await stateMachine.transition(JobState.FUNDED);
      expect(stateMachine.getState()).toBe(JobState.FUNDED);

      await stateMachine.transition(JobState.IN_PROGRESS);
      expect(stateMachine.getState()).toBe(JobState.IN_PROGRESS);

      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      expect(stateMachine.getState()).toBe(JobState.EVIDENCE_SUBMITTED);

      await stateMachine.transition(JobState.VERIFIED);
      expect(stateMachine.getState()).toBe(JobState.VERIFIED);

      await stateMachine.transition(JobState.RELEASED);
      expect(stateMachine.getState()).toBe(JobState.RELEASED);

      const history = stateMachine.getHistory();
      expect(history).toEqual([
        JobState.CREATED,
        JobState.FUNDED,
        JobState.IN_PROGRESS,
        JobState.EVIDENCE_SUBMITTED,
        JobState.VERIFIED,
        JobState.RELEASED,
      ]);
    });
  });

  describe('Disputed path: Job goes to dispute', () => {
    it('should allow transition to DISPUTED from IN_PROGRESS', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.DISPUTED);

      expect(stateMachine.getState()).toBe(JobState.DISPUTED);
    });

    it('should allow transition to DISPUTED from EVIDENCE_SUBMITTED', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      await stateMachine.transition(JobState.DISPUTED);

      expect(stateMachine.getState()).toBe(JobState.DISPUTED);
    });

    it('should allow transition to DISPUTED from VERIFIED', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      await stateMachine.transition(JobState.VERIFIED);
      await stateMachine.transition(JobState.DISPUTED);

      expect(stateMachine.getState()).toBe(JobState.DISPUTED);
    });

    it('should resolve dispute to RELEASED (worker wins)', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.DISPUTED);
      await stateMachine.transition(JobState.RELEASED);

      expect(stateMachine.getState()).toBe(JobState.RELEASED);
    });

    it('should resolve dispute to REFUNDED (customer wins)', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.DISPUTED);
      await stateMachine.transition(JobState.REFUNDED);

      expect(stateMachine.getState()).toBe(JobState.REFUNDED);
    });
  });

  describe('Cancelled path', () => {
    it('should allow cancellation from CREATED', async () => {
      await stateMachine.transition(JobState.CANCELLED);
      expect(stateMachine.getState()).toBe(JobState.CANCELLED);
    });

    it('should allow refund from FUNDED', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.REFUNDED);
      expect(stateMachine.getState()).toBe(JobState.REFUNDED);
    });

    it('should allow cancellation from IN_PROGRESS', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.CANCELLED);
      expect(stateMachine.getState()).toBe(JobState.CANCELLED);
    });
  });

  describe('Invalid transitions - should throw', () => {
    it('should not allow CREATED -> RELEASED directly', async () => {
      expect(async () => {
        await stateMachine.transition(JobState.RELEASED);
      }).rejects.toThrow();
    });

    it('should not allow CREATED -> IN_PROGRESS directly', async () => {
      expect(async () => {
        await stateMachine.transition(JobState.IN_PROGRESS);
      }).rejects.toThrow();
    });

    it('should not allow backward transitions', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);

      expect(async () => {
        await stateMachine.transition(JobState.FUNDED);
      }).rejects.toThrow();
    });

    it('should not allow transition from RELEASED', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      await stateMachine.transition(JobState.VERIFIED);
      await stateMachine.transition(JobState.RELEASED);

      expect(async () => {
        await stateMachine.transition(JobState.DISPUTED);
      }).rejects.toThrow();
    });

    it('should not allow transition from CANCELLED', async () => {
      await stateMachine.transition(JobState.CANCELLED);

      expect(async () => {
        await stateMachine.transition(JobState.FUNDED);
      }).rejects.toThrow();
    });

    it('should not allow transition from REFUNDED', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.REFUNDED);

      expect(async () => {
        await stateMachine.transition(JobState.IN_PROGRESS);
      }).rejects.toThrow();
    });
  });

  describe('State history tracking', () => {
    it('should maintain accurate history of state transitions', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      await stateMachine.transition(JobState.DISPUTED);
      await stateMachine.transition(JobState.RELEASED);

      const history = stateMachine.getHistory();
      expect(history.length).toBe(6); // Initial + 5 transitions
      expect(history[0]).toBe(JobState.CREATED);
      expect(history[history.length - 1]).toBe(JobState.RELEASED);
    });
  });

  describe('Integration: Multiple dispute scenarios', () => {
    it('should handle: Work -> Dispute -> Customer Refund', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      await stateMachine.transition(JobState.DISPUTED);
      await stateMachine.transition(JobState.REFUNDED);

      expect(stateMachine.getState()).toBe(JobState.REFUNDED);
      expect(stateMachine.canTransition(JobState.RELEASED)).toBe(false);
    });

    it('should handle: Work -> Dispute -> Worker Wins -> Payment Released', async () => {
      await stateMachine.transition(JobState.FUNDED);
      await stateMachine.transition(JobState.IN_PROGRESS);
      await stateMachine.transition(JobState.EVIDENCE_SUBMITTED);
      await stateMachine.transition(JobState.VERIFIED);
      await stateMachine.transition(JobState.DISPUTED);
      await stateMachine.transition(JobState.RELEASED);

      expect(stateMachine.getState()).toBe(JobState.RELEASED);
      expect(stateMachine.canTransition(JobState.REFUNDED)).toBe(false);
    });
  });
});

export { JobState, JobStateMachine, VALID_TRANSITIONS };
