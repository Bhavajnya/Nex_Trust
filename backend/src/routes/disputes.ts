import { Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { DisputeService, DisputeType } from '../services/dispute';
import { EscrowService } from '../services/escrow';
import { IdempotencyService } from '../services/idempotency';
import { TransactionManager } from '../services/transaction-manager';
import {
  createAuthMiddleware,
  requireRole,
  requireIdempotencyKey,
  UserRole,
  AuthenticatedRequest,
} from '../middleware/auth';

export function createDisputeRoutes(db: Firestore, transactionManager?: TransactionManager): Router {
  const router = Router();
  
  // Initialize services
  const idempotencyService = new IdempotencyService(db);
  const escrowService = new EscrowService(db, idempotencyService, transactionManager!);
  const disputeService = new DisputeService(db, escrowService, idempotencyService);

  // Apply authentication middleware
  router.use(createAuthMiddleware(db));

  /**
   * GET /disputes/pending
   * Get pending disputes for admin review
   */
  router.get('/pending', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res) => {
    try {
      const disputes = await disputeService.getPendingDisputes();

      res.status(200).json({
        success: true,
        count: disputes.length,
        disputes,
      });
    } catch (error) {
      console.error('[DisputeRoute] Error getting pending disputes:', error);
      res.status(500).json({
        error: 'Failed to get pending disputes',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /disputes/:disputeId
   * Get dispute details
   */
  router.get('/:disputeId', async (req: AuthenticatedRequest, res) => {
    try {
      const { disputeId } = req.params;

      const dispute = await disputeService.getDispute(disputeId);

      if (!dispute) {
        return res.status(404).json({
          error: 'Dispute not found',
          code: 'DISPUTE_NOT_FOUND',
        });
      }

      // Check access: admin, buyer, or freelancer
      const isAdmin = req.user?.roles.includes(UserRole.ADMIN);
      const isBuyer = dispute.buyerId === req.user?.uid;
      const isFreelancer = dispute.freelancerId === req.user?.uid;

      if (!isAdmin && !isBuyer && !isFreelancer) {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'NOT_AUTHORIZED',
        });
      }

      res.status(200).json({
        success: true,
        dispute,
      });
    } catch (error) {
      console.error('[DisputeRoute] Error getting dispute:', error);
      res.status(500).json({
        error: 'Failed to get dispute',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /disputes/job/:jobId
   * Get disputes for a job
   */
  router.get('/job/:jobId', async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId } = req.params;

      const disputes = await disputeService.getJobDisputes(jobId);

      res.status(200).json({
        success: true,
        count: disputes.length,
        disputes,
      });
    } catch (error) {
      console.error('[DisputeRoute] Error getting job disputes:', error);
      res.status(500).json({
        error: 'Failed to get job disputes',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /disputes/create
   * Create a new dispute for a failed verification or unfulfilled job
   * Can be initiated by buyer or freelancer
   */
  router.post(
    '/create',
    requireIdempotencyKey,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { jobId, type, description, evidenceIds } = z
          .object({
            jobId: z.string().min(1),
            type: z.enum(['WORK_NOT_COMPLETED', 'WORK_UNSATISFACTORY', 'PAYMENT_ISSUE', 'OTHER']),
            description: z.string().min(10).max(1000),
            evidenceIds: z.array(z.string()).optional(),
          })
          .parse(req.body);

        // Verify job exists
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
          return res.status(404).json({
            error: 'Job not found',
            code: 'JOB_NOT_FOUND',
          });
        }

        const jobData = jobDoc.data() as any;

        // Verify user is buyer or freelancer
        const isBuyer = jobData.buyerId === req.user?.uid;
        const isFreelancer = jobData.freelancerId === req.user?.uid;

        if (!isBuyer && !isFreelancer) {
          console.warn('[DisputeRoute] Unauthorized dispute creation:', {
            userId: req.user?.uid,
            jobId,
            buyerId: jobData.buyerId,
            freelancerId: jobData.freelancerId,
          });
          return res.status(403).json({
            error: 'Only buyer or freelancer can create dispute',
            code: 'NOT_AUTHORIZED',
          });
        }

        console.log('[DisputeRoute] Creating dispute for job:', jobId, 'type:', type, 'by:', req.user?.uid);

        // Create dispute via service
        const dispute = await disputeService.createDispute({
          jobId,
          buyerId: jobData.buyerId,
          freelancerId: jobData.freelancerId,
          type: type as DisputeType,
          reason: description,
          createdBy: req.user!.uid,
          evidenceIds: evidenceIds || [],
        });

        console.log('[DisputeRoute] Dispute created:', dispute.id);

        res.status(201).json({
          success: true,
          disputeId: dispute.id,
          dispute,
          message: 'Dispute created successfully. Admin will review and make a decision.',
        });
      } catch (error) {
        console.error('[DisputeRoute] Error creating dispute:', error);
        res.status(400).json({
          error: 'Failed to create dispute',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /disputes/resolve/:disputeId
   * Resolve dispute with admin decision
   */
  router.post(
    '/resolve/:disputeId',
    requireRole(UserRole.ADMIN),
    requireIdempotencyKey,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { disputeId } = req.params;
        const { decision, freelancerPercentage, reasoning } = z
          .object({
            decision: z.enum(['release', 'refund', 'split']),
            freelancerPercentage: z.number().min(0).max(100).optional(),
            reasoning: z.string().min(10),
          })
          .parse(req.body);

        // Validate split percentage is provided for split decision
        if (decision === 'split' && freelancerPercentage === undefined) {
          return res.status(400).json({
            error: 'freelancerPercentage required for split decision',
            code: 'MISSING_SPLIT_PERCENTAGE',
          });
        }

        const resolvedDispute = await disputeService.resolveDispute({
          disputeId,
          decision,
          freelancerPercentage,
          reasoning,
          resolvedBy: req.user!.uid,
        });

        res.status(200).json({
          success: true,
          dispute: resolvedDispute,
          message: `Dispute resolved: ${decision} (freelancer: ${resolvedDispute.resolution?.freelancerAmount || 0})`,
        });
      } catch (error) {
        console.error('[DisputeRoute] Error resolving dispute:', error);
        res.status(500).json({
          error: 'Failed to resolve dispute',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /disputes/stats
   * Get dispute statistics
   */
  router.get('/stats', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await disputeService.getDisputeStats();

      res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('[DisputeRoute] Error getting stats:', error);
      res.status(500).json({
        error: 'Failed to get dispute stats',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
