import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { Firestore } from 'firebase-admin/firestore';
import { ReconciliationService } from '../services/reconciliation';
import { ReconciliationWorker } from '../workers/reconciliation-worker';
import { TransactionManager } from '../services/transaction-manager';
import Redis from 'ioredis';

export function createReconciliationRoutes(
  db: Firestore,
  stripe: Stripe,
  redis: Redis,
  reconciliationWorker: ReconciliationWorker
): Router {
  const router = Router();
  const transactionManager = new TransactionManager(db);
  const reconciliationService = new ReconciliationService(db, stripe, transactionManager);

  /**
   * POST /reconciliation/run
   * Manually trigger a reconciliation job
   */
  router.post('/run', async (req: Request, res: Response) => {
    try {
      console.log('[ReconciliationRoute] Manually triggered reconciliation');

      const jobId = await reconciliationWorker.scheduleReconciliation();

      res.status(200).json({
        success: true,
        message: 'Reconciliation job scheduled',
        jobId,
      });
    } catch (error) {
      console.error('[ReconciliationRoute] Error scheduling reconciliation:', error);
      res.status(500).json({
        error: 'Failed to schedule reconciliation',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /reconciliation/reconcile-pair
   * Reconcile a specific payment-escrow pair
   */
  router.post('/reconcile-pair', async (req: Request, res: Response) => {
    try {
      const { paymentId, escrowId } = req.body;

      if (!paymentId || !escrowId) {
        return res.status(400).json({ error: 'Missing paymentId or escrowId' });
      }

      const result = await reconciliationService.reconcilePair(paymentId, escrowId);

      res.status(200).json({
        success: true,
        result,
      });
    } catch (error) {
      console.error('[ReconciliationRoute] Error reconciling pair:', error);
      res.status(500).json({
        error: 'Failed to reconcile pair',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /reconciliation/snapshot
   * Create a payment-escrow snapshot
   */
  router.post('/snapshot', async (req: Request, res: Response) => {
    try {
      const { paymentId, escrowId } = req.body;

      if (!paymentId || !escrowId) {
        return res.status(400).json({ error: 'Missing paymentId or escrowId' });
      }

      const snapshot = await reconciliationService.createSnapshot(paymentId, escrowId);

      res.status(200).json({
        success: true,
        snapshot,
      });
    } catch (error) {
      console.error('[ReconciliationRoute] Error creating snapshot:', error);
      res.status(500).json({
        error: 'Failed to create snapshot',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /reconciliation/jobs
   * Get recent reconciliation jobs
   */
  router.get('/jobs', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      const jobs = await reconciliationService.getRecentJobs(limit);

      res.status(200).json({
        success: true,
        jobs,
        count: jobs.length,
      });
    } catch (error) {
      console.error('[ReconciliationRoute] Error getting jobs:', error);
      res.status(500).json({
        error: 'Failed to get jobs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /reconciliation/jobs/:jobId
   * Get specific reconciliation job details
   */
  router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const doc = await db.collection('reconciliation_jobs').doc(jobId).get();

      if (!doc.exists) {
        return res.status(404).json({ error: 'Reconciliation job not found' });
      }

      res.status(200).json({
        success: true,
        job: doc.data(),
      });
    } catch (error) {
      console.error('[ReconciliationRoute] Error getting job details:', error);
      res.status(500).json({
        error: 'Failed to get job details',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /reconciliation/status
   * Get reconciliation system status
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const recentJobs = await reconciliationService.getRecentJobs(5);

      const totalMismatches = recentJobs.reduce((sum, job) => sum + job.totalMismatches, 0);
      const totalRecoveries = recentJobs.reduce((sum, job) => sum + job.totalRecoveries, 0);
      const totalProcessed = recentJobs.reduce((sum, job) => sum + job.totalProcessed, 0);

      const lastJob = recentJobs[0];
      const status = lastJob ? lastJob.status : 'idle';
      const lastRunTime = lastJob ? lastJob.startTime : null;

      res.status(200).json({
        success: true,
        status,
        lastRunTime,
        recentStats: {
          totalProcessed,
          totalMismatches,
          totalRecoveries,
        },
        recentJobs: recentJobs.slice(0, 5),
      });
    } catch (error) {
      console.error('[ReconciliationRoute] Error getting status:', error);
      res.status(500).json({
        error: 'Failed to get status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
