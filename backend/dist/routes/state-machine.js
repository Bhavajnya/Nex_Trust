"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const state_machine_1 = require("../services/state-machine");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
/**
 * Validation schemas
 */
const TransitionRequestSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    toState: zod_1.z.enum(Object.values(state_machine_1.JobState)),
    reason: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const CanTransitionSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    toState: zod_1.z.enum(Object.values(state_machine_1.JobState)),
});
const ForceTransitionSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    toState: zod_1.z.enum(Object.values(state_machine_1.JobState)),
    reason: zod_1.z.string().min(1),
});
/**
 * GET /api/state-machine/valid-transitions/:state
 * Get all valid next states for a given state
 */
router.get('/valid-transitions/:state', async (req, res) => {
    try {
        const { state } = req.params;
        if (!Object.values(state_machine_1.JobState).includes(state)) {
            return res.status(400).json({
                error: 'Invalid state',
                validStates: Object.values(state_machine_1.JobState),
            });
        }
        const validNextStates = state_machine_1.stateMachine.getValidNextStates(state);
        res.json({
            currentState: state,
            validNextStates,
            count: validNextStates.length,
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting valid transitions', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /api/state-machine/can-transition
 * Check if a transition is valid without performing it
 */
router.post('/can-transition', async (req, res) => {
    try {
        const parsed = CanTransitionSchema.parse(req.body);
        const { jobId, toState } = parsed;
        // Get current state
        const currentState = await state_machine_1.stateMachine.getJobState(jobId);
        if (!currentState) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const canTransition = state_machine_1.stateMachine.canTransition(currentState, toState);
        res.json({
            jobId,
            currentState,
            targetState: toState,
            canTransition,
            validNextStates: state_machine_1.stateMachine.getValidNextStates(currentState),
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid request', details: error.errors });
        }
        logger_1.logger.error('Error checking transition validity', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /api/state-machine/transition
 * Perform a state transition
 */
router.post('/transition', async (req, res) => {
    try {
        const parsed = TransitionRequestSchema.parse(req.body);
        const { jobId, toState, reason, metadata } = parsed;
        // Get current state
        const currentState = await state_machine_1.stateMachine.getJobState(jobId);
        if (!currentState) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Check if transition is valid
        if (!state_machine_1.stateMachine.canTransition(currentState, toState)) {
            return res.status(400).json({
                error: `Invalid state transition: ${currentState} → ${toState}`,
                currentState,
                validNextStates: state_machine_1.stateMachine.getValidNextStates(currentState),
            });
        }
        // Perform transition
        const context = {
            jobId,
            fromState: currentState,
            toState: toState,
            userId: req.userId || 'system',
            reason,
            metadata,
        };
        await state_machine_1.stateMachine.transitionState(context);
        res.json({
            success: true,
            jobId,
            fromState: currentState,
            toState,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid request', details: error.errors });
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Invalid state transition')) {
            return res.status(400).json({ error: errorMessage });
        }
        logger_1.logger.error('Error performing transition', { error: errorMessage });
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * GET /api/state-machine/history/:jobId
 * Get transition history for a job
 */
router.get('/history/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const history = await state_machine_1.stateMachine.getTransitionHistory(jobId);
        const events = await state_machine_1.stateMachine.getDomainEvents(jobId);
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
    }
    catch (error) {
        logger_1.logger.error('Error fetching transition history', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * GET /api/state-machine/consistency/:jobId
 * Validate that job state is consistent with related records
 */
router.get('/consistency/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await state_machine_1.stateMachine.validateStateConsistency(jobId);
        res.json({
            jobId,
            valid: result.valid,
            issues: result.issues,
        });
    }
    catch (error) {
        logger_1.logger.error('Error validating state consistency', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /api/state-machine/force-transition (Admin only)
 * Force a state transition (use with extreme caution)
 */
router.post('/force-transition', async (req, res) => {
    try {
        // Check if user is admin (this should be verified via middleware in production)
        const userId = req.userId || 'system';
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const parsed = ForceTransitionSchema.parse(req.body);
        const { jobId, toState, reason } = parsed;
        const currentState = await state_machine_1.stateMachine.getJobState(jobId);
        if (!currentState) {
            return res.status(404).json({ error: 'Job not found' });
        }
        logger_1.logger.warn(`Admin force transition requested: ${jobId} ${currentState} → ${toState}`, { userId, reason });
        await state_machine_1.stateMachine.forceTransition(jobId, toState, reason, userId);
        res.json({
            success: true,
            jobId,
            fromState: currentState,
            toState,
            forced: true,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid request', details: error.errors });
        }
        logger_1.logger.error('Error performing force transition', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * GET /api/state-machine/states
 * Get all available states
 */
router.get('/states', (req, res) => {
    res.json({
        states: Object.values(state_machine_1.JobState),
        descriptions: {
            [state_machine_1.JobState.CREATED]: 'Job created, waiting for payment',
            [state_machine_1.JobState.FUNDED]: 'Payment received, waiting for freelancer acceptance',
            [state_machine_1.JobState.ACCEPTED]: 'Freelancer accepted, work in progress',
            [state_machine_1.JobState.IN_PROGRESS]: 'Work in progress',
            [state_machine_1.JobState.EVIDENCE_SUBMITTED]: 'Freelancer submitted evidence/completion proof',
            [state_machine_1.JobState.AI_VERIFIED]: 'AI verified the evidence and approved',
            [state_machine_1.JobState.RELEASED]: 'Payment released to freelancer',
            [state_machine_1.JobState.DISPUTED]: 'Job has a dispute',
            [state_machine_1.JobState.RESOLVED]: 'Dispute resolved',
            [state_machine_1.JobState.CANCELLED]: 'Job cancelled',
            [state_machine_1.JobState.FAILED]: 'Job failed',
        },
    });
});
exports.default = router;
