import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { Job } from '../types';
import { PaymentService } from '../services/payment';
import { IdempotencyService } from '../services/idempotency';
import { PaymentStateCoordinator } from '../services/payment-state-coordinator';
import { TransactionManager } from '../services/transaction-manager';
import { StateMachineService } from '../services/state-machine';
import { StateMachineGuards } from '../services/state-machine-guards';
import { EscrowService } from '../services/escrow';
import {
  createAuthMiddleware,
  requireRole,
  requireIdempotencyKey,
  requireResourceOwnership,
  UserRole,
  AuthenticatedRequest,
} from '../middleware/auth';

export function createPaymentRoutes(
  db: Firestore,
  stripe: Stripe,
  transactionManager: TransactionManager
): Router {
  const router = Router();

  const idempotency = new IdempotencyService(db);
  const paymentService = new PaymentService(db, stripe, idempotency, transactionManager);
  const stateMachine = new StateMachineService();
  const guards = new StateMachineGuards(db);
  const escrowService = new EscrowService(db, idempotency, transactionManager);
  const coordinator = new PaymentStateCoordinator(
    db,
    stateMachine,
    guards,
    paymentService,
    escrowService,
    stripe
  );

  router.use(createAuthMiddleware(db));

  /**
   * POST /payments/fund
   * Fund a job - creates payment and transitions job state to FUNDED
   */
  router.post(
    '/fund',
    requireRole(UserRole.CUSTOMER),
    requireIdempotencyKey,
    requireResourceOwnership(db),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { jobId, amount, currency } = z
          .object({
            jobId: z.string().min(1),
            amount: z.number().positive(),
            currency: z.string().length(3),
          })
          .parse(req.body);

        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
          return res.status(404).json({ error: 'Job not found' });
        }

        const job = jobDoc.data() as Job;

        if (job.amount !== amount || job.currency.toLowerCase() !== currency.toLowerCase()) {
          return res.status(400).json({
            error: 'Amount or currency does not match job record',
          });
        }

        const result = await coordinator.fundJobWithStateTransition({
          jobId,
          buyerId: job.buyerId,
          freelancerId: job.freelancerId,
          amount: job.amount,
          currency: job.currency,
          title: job.title,
          description: job.description,
          userId: req.user!.uid,
          idempotencyKey: req.idempotencyKey!,
        });

        return res.status(200).json({
          success: true,
          ...result,
        });
      } catch (error) {
        console.error('[PaymentRoute] Error funding job:', error);
        return res.status(500).json({
          error: 'Failed to fund job',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /payments/confirm
   */
  router.post(
    '/confirm',
    requireIdempotencyKey,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { paymentId, stripeIntentId } = z
          .object({
            paymentId: z.string().min(1),
            stripeIntentId: z.string().min(1),
          })
          .parse(req.body);

        await paymentService.confirmPayment({
          paymentId,
          stripeIntentId,
          idempotencyKey: req.idempotencyKey!,
        });

        return res.status(200).json({
          success: true,
          message: 'Payment confirmed',
          idempotencyKey: req.idempotencyKey,
        });
      } catch (error) {
        console.error('[PaymentRoute] Error confirming payment:', error);
        return res.status(500).json({
          error: 'Failed to confirm payment',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /payments/job/:jobId
   * Put this before /:paymentId so Express doesn't match it as paymentId.
   */
  router.get('/job/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const payments = await paymentService.getJobPayments(jobId);

      return res.status(200).json({
        success: true,
        payments,
      });
    } catch (error) {
      console.error('[PaymentRoute] Error getting job payments:', error);
      return res.status(500).json({
        error: 'Failed to get payments',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /payments/:paymentId
   */
  router.get('/:paymentId', async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      const payment = await paymentService.getPayment(paymentId);

      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      return res.status(200).json({
        success: true,
        payment,
      });
    } catch (error) {
      console.error('[PaymentRoute] Error getting payment:', error);
      return res.status(500).json({
        error: 'Failed to get payment',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /payments/release
   */
  router.post(
    '/release',
    requireRole(UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { jobId, reason } = z
          .object({
            jobId: z.string().min(1),
            reason: z.string().optional(),
          })
          .parse(req.body);

        const releaseReason = reason || 'Payment release requested by admin';

        const result = await coordinator.releasePaymentWithStateTransition({
          jobId,
          userId: req.user!.uid,
          reason: releaseReason,
        });

        return res.status(200).json({
          success: true,
          ...result,
        });
      } catch (error) {
        console.error('[PaymentRoute] Error releasing payment:', error);
        return res.status(400).json({
          error: 'Failed to release payment',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}