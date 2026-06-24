import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { EscrowService } from '../services/escrow';
import { IdempotencyService } from '../services/idempotency';
import { TransactionManager } from '../services/transaction-manager';

const holdEscrowSchema = z.object({
  jobId: z.string().min(1),
  buyerId: z.string().min(1),
  freelancerId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  paymentRecordId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const releaseEscrowSchema = z.object({
  escrowId: z.string().min(1),
  reason: z.string().optional(),
});

const refundEscrowSchema = z.object({
  escrowId: z.string().min(1),
  reason: z.string().optional(),
});

export function createEscrowRoutes(db: Firestore): Router {
  const router = Router();
  const idempotency = new IdempotencyService(db);
  const transactionManager = new TransactionManager(db);
  const escrowService = new EscrowService(db, idempotency, transactionManager);

  /**
   * POST /escrow/hold
   * Hold funds in escrow
   */
  router.post('/hold', async (req: Request, res: Response) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string || uuidv4();

      const parsed = holdEscrowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error });
      }

      const { jobId, buyerId, freelancerId, amount, currency, paymentRecordId, metadata } =
        parsed.data;

      const escrowId = await escrowService.holdEscrow({
        jobId,
        buyerId,
        freelancerId,
        amount,
        currency,
        paymentRecordId,
        idempotencyKey,
        metadata,
      });

      res.status(200).json({
        success: true,
        escrowId,
        idempotencyKey,
      });
    } catch (error) {
      console.error('[EscrowRoute] Error holding escrow:', error);
      res.status(500).json({
        error: 'Failed to hold escrow',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /escrow/release
   * Release escrow to freelancer
   */
  router.post('/release', async (req: Request, res: Response) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string || uuidv4();

      const parsed = releaseEscrowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error });
      }

      const { escrowId, reason } = parsed.data;

      await escrowService.releaseEscrow({
        escrowId,
        idempotencyKey,
        reason,
      });

      res.status(200).json({
        success: true,
        message: 'Escrow released',
        idempotencyKey,
      });
    } catch (error) {
      console.error('[EscrowRoute] Error releasing escrow:', error);
      res.status(500).json({
        error: 'Failed to release escrow',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /escrow/refund
   * Refund escrow to buyer
   */
  router.post('/refund', async (req: Request, res: Response) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string || uuidv4();

      const parsed = refundEscrowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error });
      }

      const { escrowId, reason } = parsed.data;

      await escrowService.refundEscrow({
        escrowId,
        idempotencyKey,
        reason,
      });

      res.status(200).json({
        success: true,
        message: 'Escrow refunded',
        idempotencyKey,
      });
    } catch (error) {
      console.error('[EscrowRoute] Error refunding escrow:', error);
      res.status(500).json({
        error: 'Failed to refund escrow',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /escrow/:escrowId
   * Get escrow details
   */
  router.get('/:escrowId', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;

      const escrow = await escrowService.getEscrow(escrowId);

      if (!escrow) {
        return res.status(404).json({ error: 'Escrow not found' });
      }

      res.status(200).json({
        success: true,
        escrow,
      });
    } catch (error) {
      console.error('[EscrowRoute] Error getting escrow:', error);
      res.status(500).json({
        error: 'Failed to get escrow',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /escrow/job/:jobId
   * Get escrow for a job
   */
  router.get('/job/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const escrow = await escrowService.getJobEscrow(jobId);

      if (!escrow) {
        return res.status(404).json({ error: 'Escrow not found for job' });
      }

      res.status(200).json({
        success: true,
        escrow,
      });
    } catch (error) {
      console.error('[EscrowRoute] Error getting job escrow:', error);
      res.status(500).json({
        error: 'Failed to get escrow',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
