"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJobRoutes = createJobRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const job_service_1 = require("../services/job-service");
/**
 * Jobs Routes - CRUD operations for job postings
 * All routes require Firebase authentication
 */
const jobCreateSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(100),
    description: zod_1.z.string().min(10).max(5000),
    budget: zod_1.z.number().positive(),
    currency: zod_1.z.string().default('USD'),
    deadline: zod_1.z.string().datetime().optional(),
    requiredSkills: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
function createJobRoutes(db) {
    const router = (0, express_1.Router)();
    const jobService = new job_service_1.JobService(db);
    /**
     * POST /api/jobs - Create a new job posting
     * Requires: Authenticated user (customer/buyer)
     */
    router.post('/', async (req, res) => {
        try {
            const validation = jobCreateSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: 'Validation failed',
                    issues: validation.error.issues,
                });
            }
            const buyerId = req.user?.uid;
            if (!buyerId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const job = await jobService.createJob(buyerId, validation.data);
            return res.status(201).json({
                success: true,
                data: job,
                message: 'Job created successfully',
            });
        }
        catch (err) {
            console.error('[Jobs] POST error:', err);
            return res.status(500).json({
                error: 'Internal server error',
                message: err.message,
            });
        }
    });
    /**
     * GET /api/jobs - List jobs with pagination and filtering
     * Query params: page, limit, state, buyerId, workerId
     */
    router.get('/', async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(100, parseInt(req.query.limit) || 20);
            const result = await jobService.listJobs({
                page,
                limit,
                state: req.query.state,
                buyerId: req.query.buyerId,
                workerId: req.query.workerId,
            });
            return res.json({
                success: true,
                data: result.jobs,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    pages: Math.ceil(result.total / limit),
                },
            });
        }
        catch (err) {
            console.error('[Jobs] GET list error:', err);
            return res.status(500).json({
                error: 'Internal server error',
                message: err.message,
            });
        }
    });
    /**
     * GET /api/jobs/:id - Get a single job by ID
     */
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const job = await jobService.getJob(id);
            return res.json({
                success: true,
                data: job,
            });
        }
        catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: 'Job not found' });
            }
            console.error('[Jobs] GET single error:', err);
            return res.status(500).json({
                error: 'Internal server error',
                message: err.message,
            });
        }
    });
    /**
     * PUT /api/jobs/:id/accept - Worker accepts a job
     * Transitions: CREATED → FUNDED
     */
    router.put('/:id/accept', async (req, res) => {
        try {
            const { id } = req.params;
            const workerId = req.user?.uid;
            if (!workerId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const job = await jobService.acceptJob(id, workerId);
            return res.json({
                success: true,
                data: job,
                message: 'Job accepted successfully',
            });
        }
        catch (err) {
            const errMsg = err.message;
            if (errMsg.includes('not found')) {
                return res.status(404).json({ error: 'Job not found' });
            }
            if (errMsg.includes('Cannot accept')) {
                return res.status(400).json({ error: errMsg });
            }
            console.error('[Jobs] PUT accept error:', err);
            return res.status(500).json({
                error: 'Internal server error',
                message: errMsg,
            });
        }
    });
    /**
     * PUT /api/jobs/:id/start - Worker starts work
     * Transitions: FUNDED → IN_PROGRESS
     */
    router.put('/:id/start', async (req, res) => {
        try {
            const { id } = req.params;
            const workerId = req.user?.uid;
            if (!workerId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const job = await jobService.startJob(id, workerId);
            return res.json({
                success: true,
                data: job,
                message: 'Work started successfully',
            });
        }
        catch (err) {
            const errMsg = err.message;
            if (errMsg.includes('not found')) {
                return res.status(404).json({ error: 'Job not found' });
            }
            if (errMsg.includes('Cannot start') || errMsg.includes('not assigned')) {
                return res.status(400).json({ error: errMsg });
            }
            console.error('[Jobs] PUT start error:', err);
            return res.status(500).json({
                error: 'Internal server error',
                message: errMsg,
            });
        }
    });
    /**
     * PUT /api/jobs/:id/cancel - Cancel a job (buyer only)
     */
    router.put('/:id/cancel', async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const job = await jobService.cancelJob(id, userId);
            return res.json({
                success: true,
                data: job,
                message: 'Job cancelled successfully',
            });
        }
        catch (err) {
            const errMsg = err.message;
            if (errMsg.includes('not found')) {
                return res.status(404).json({ error: 'Job not found' });
            }
            if (errMsg.includes('Only job buyer') || errMsg.includes('Cannot cancel')) {
                return res.status(403).json({ error: errMsg });
            }
            console.error('[Jobs] PUT cancel error:', err);
            return res.status(500).json({
                error: 'Internal server error',
                message: errMsg,
            });
        }
    });
    return router;
}
