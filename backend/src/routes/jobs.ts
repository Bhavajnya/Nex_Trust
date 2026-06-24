import { Router, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { JobService } from '../services/job-service';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * Jobs Routes - CRUD operations for job postings
 * All routes require Firebase authentication
 */

const jobCreateSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(5000),
  budget: z.number().positive(),
  currency: z.string().default('USD'),
  deadline: z.string().datetime().optional(),
  requiredSkills: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function createJobRoutes(db: Firestore): Router {
  const router = Router();
  const jobService = new JobService(db);

  /**
   * POST /api/jobs - Create a new job posting
   * Requires: Authenticated user (customer/buyer)
   */
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
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
    } catch (err) {
      console.error('[Jobs] POST error:', err);
      return res.status(500).json({
        error: 'Internal server error',
        message: (err as Error).message,
      });
    }
  });

  /**
   * GET /api/jobs - List jobs with pagination and filtering
   * Query params: page, limit, state, buyerId, workerId, role
   * role: "customer" filters to jobs where the user is the buyer
   * role: "worker" filters to jobs where the user is the worker
   */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Build filter based on role parameter
      let buyerId: string | undefined;
      let workerId: string | undefined;

      const role = req.query.role as string;
      if (role === 'customer') {
        // Show jobs this user created as a buyer
        buyerId = userId;
      } else if (role === 'worker') {
        // Show jobs this user accepted as a worker
        workerId = userId;
      } else {
        // Use explicit IDs if provided
        buyerId = req.query.buyerId as string;
        workerId = req.query.workerId as string;
      }

      const result = await jobService.listJobs({
        page,
        limit,
        state: req.query.state as any,
        buyerId,
        workerId,
      });

      return res.json({
        success: true,
        data: { jobs: result.jobs },
        pagination: {
          page,
          limit,
          total: result.total,
          pages: Math.ceil(result.total / limit),
        },
      });
    } catch (err) {
      console.error('[Jobs] GET list error:', err);
      return res.status(500).json({
        error: 'Internal server error',
        message: (err as Error).message,
      });
    }
  });

  /**
   * GET /api/jobs/:id - Get a single job by ID
   */
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const job = await jobService.getJob(id);

      return res.json({
        success: true,
        data: job,
      });
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        return res.status(404).json({ error: 'Job not found' });
      }
      console.error('[Jobs] GET single error:', err);
      return res.status(500).json({
        error: 'Internal server error',
        message: (err as Error).message,
      });
    }
  });

  /**
   * PUT /api/jobs/:id/accept - Worker accepts a job
   * Transitions: CREATED → FUNDED
   */
  router.put('/:id/accept', async (req: AuthenticatedRequest, res: Response) => {
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
    } catch (err) {
      const errMsg = (err as Error).message;
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
  router.put('/:id/start', async (req: AuthenticatedRequest, res: Response) => {
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
    } catch (err) {
      const errMsg = (err as Error).message;
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
  router.put('/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
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
    } catch (err) {
      const errMsg = (err as Error).message;
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
