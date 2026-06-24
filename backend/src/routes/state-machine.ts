import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { stateMachine, JobState, TransitionContext } from '../services/state-machine';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Validation schemas
 */
const TransitionRequestSchema = z.object({
  jobId: z.string().min(1),
  toState: z.enum(Object.values(JobState) as [string, ...string[]]),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CanTransitionSchema = z.object({
  jobId: z.string().min(1),
  toState: z.enum(Object.values(JobState) as [string, ...string[]]),
});

const ForceTransitionSchema = z.object({
  jobId: z.string().min(1),
  toState: z.enum(Object.values(JobState) as [string, ...string[]]),
  reason: z.string().min(1),
});

/**
 * GET /api/state-machine/valid-transitions/:state
 * Get all valid next states for a given state
 */
router.get('/valid-transitions/:state', async (req: Request, res: Response) => {
  try {
    const { state } = req.params;

    if (!Object.values(JobState).includes(state as JobState)) {
      return res.status(400).json({
        error: 'Invalid state',
        validStates: Object.values(JobState),
      });
    }

    const validNextStates = stateMachine.getValidNextStates(state as JobState);

    res.json({
      currentState: state,
      validNextStates,
      count: validNextStates.length,
    });
  } catch (error) {
    logger.error(
      'Error getting valid transitions',
      { error: error instanceof Error ? error.message : String(error) }
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/state-machine/can-transition
 * Check if a transition is valid without performing it
 */
router.post('/can-transition', async (req: Request, res: Response) => {
  try {
    const parsed = CanTransitionSchema.parse(req.body);
    const { jobId, toState } = parsed;

    // Get current state
    const currentState = await stateMachine.getJobState(jobId);
    if (!currentState) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const canTransition = stateMachine.canTransition(currentState, toState as JobState);

    res.json({
      jobId,
      currentState,
      targetState: toState,
      canTransition,
      validNextStates: stateMachine.getValidNextStates(currentState),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: (error as any).errors || error.message });
    }
    logger.error(
      'Error checking transition validity',
      { error: error instanceof Error ? error.message : String(error) }
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/state-machine/transition
 * Perform a state transition
 */
router.post('/transition', async (req: Request, res: Response) => {
  try {
    const parsed = TransitionRequestSchema.parse(req.body);
    const { jobId, toState, reason, metadata } = parsed;

    // Get current state
    const currentState = await stateMachine.getJobState(jobId);
    if (!currentState) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check if transition is valid
    if (!stateMachine.canTransition(currentState, toState as JobState)) {
      return res.status(400).json({
        error: `Invalid state transition: ${currentState} → ${toState}`,
        currentState,
        validNextStates: stateMachine.getValidNextStates(currentState),
      });
    }

    // Perform transition
    const context: TransitionContext = {
      jobId,
      fromState: currentState as JobState,
      toState: toState as JobState,
      userId: (req as any).userId || 'system',
      reason,
      metadata,
    };

    await stateMachine.transitionState(context);

    res.json({
      success: true,
      jobId,
      fromState: currentState,
      toState,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: (error as any).errors || error.message });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Invalid state transition')) {
      return res.status(400).json({ error: errorMessage });
    }

    logger.error(
      'Error performing transition',
      { error: errorMessage }
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/state-machine/history/:jobId
 * Get transition history for a job
 */
router.get('/history/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const history = await stateMachine.getTransitionHistory(jobId);
    const events = await stateMachine.getDomainEvents(jobId);

    res.json({
      jobId,
      transitionCount: history.length,
      transitions: history,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        fromState: e.fromState,
        toState: e.toState,
        createdAt: e.createdAt,
        processed: e.processed,
      })),
    });
  } catch (error) {
    logger.error(
      'Error fetching transition history',
      { error: error instanceof Error ? error.message : String(error) }
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/state-machine/consistency/:jobId
 * Validate that job state is consistent with related records
 */
router.get('/consistency/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const result = await stateMachine.validateStateConsistency(jobId);

    res.json({
      jobId,
      valid: result.valid,
      issues: result.issues,
    });
  } catch (error) {
    logger.error(
      'Error validating state consistency',
      { error: error instanceof Error ? error.message : String(error) }
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/state-machine/force-transition (Admin only)
 * Force a state transition (use with extreme caution)
 */
router.post('/force-transition', async (req: Request, res: Response) => {
  try {
    // Check if user is admin (this should be verified via middleware in production)
    const userId = (req as any).userId || 'system';
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = ForceTransitionSchema.parse(req.body);
    const { jobId, toState, reason } = parsed;

    const currentState = await stateMachine.getJobState(jobId);
    if (!currentState) {
      return res.status(404).json({ error: 'Job not found' });
    }

    logger.warn(
      `Admin force transition requested: ${jobId} ${currentState} → ${toState}`,
      { userId, reason }
    );

    await stateMachine.forceTransition(jobId, toState as JobState, reason, userId);

    res.json({
      success: true,
      jobId,
      fromState: currentState,
      toState,
      forced: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: (error as any).errors || error.message });
    }

    logger.error(
      'Error performing force transition',
      { error: error instanceof Error ? error.message : String(error) }
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/state-machine/states
 * Get all available states
 */
router.get('/states', (req: Request, res: Response) => {
  res.json({
    states: Object.values(JobState),
    descriptions: {
      [JobState.CREATED]: 'Job created, waiting for payment',
      [JobState.FUNDED]: 'Payment received, waiting for freelancer acceptance',
      [JobState.ACCEPTED]: 'Freelancer accepted, work in progress',
      [JobState.IN_PROGRESS]: 'Work in progress',
      [JobState.EVIDENCE_SUBMITTED]: 'Freelancer submitted evidence/completion proof',
      [JobState.VERIFIED]: 'Evidence verified and approved',
      [JobState.RELEASED]: 'Payment released to freelancer',
      [JobState.DISPUTED]: 'Job has a dispute',
      [JobState.RESOLVED]: 'Dispute resolved',
      [JobState.CANCELLED]: 'Job cancelled',
      [JobState.FAILED]: 'Job failed',
    },
  });
});

export default router;
