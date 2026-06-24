"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEscrowRoutes = createEscrowRoutes;
const express_1 = require("express");
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const escrow_1 = require("../services/escrow");
const idempotency_1 = require("../services/idempotency");
const holdEscrowSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    buyerId: zod_1.z.string().min(1),
    freelancerId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().length(3),
    paymentRecordId: zod_1.z.string().min(1),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const releaseEscrowSchema = zod_1.z.object({
    escrowId: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
});
const refundEscrowSchema = zod_1.z.object({
    escrowId: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
});
function createEscrowRoutes(db) {
    const router = (0, express_1.Router)();
    const idempotency = new idempotency_1.IdempotencyService(db);
    const escrowService = new escrow_1.EscrowService(db, idempotency);
    /**
     * POST /escrow/hold
     * Hold funds in escrow
     */
    router.post('/hold', async (req, res) => {
        try {
            const idempotencyKey = req.headers['idempotency-key'] || (0, uuid_1.v4)();
            const parsed = holdEscrowSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Invalid request', details: parsed.error });
            }
            const { jobId, buyerId, freelancerId, amount, currency, paymentRecordId, metadata } = parsed.data;
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
        }
        catch (error) {
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
    router.post('/release', async (req, res) => {
        try {
            const idempotencyKey = req.headers['idempotency-key'] || (0, uuid_1.v4)();
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
        }
        catch (error) {
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
    router.post('/refund', async (req, res) => {
        try {
            const idempotencyKey = req.headers['idempotency-key'] || (0, uuid_1.v4)();
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
        }
        catch (error) {
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
    router.get('/:escrowId', async (req, res) => {
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
        }
        catch (error) {
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
    router.get('/job/:jobId', async (req, res) => {
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
        }
        catch (error) {
            console.error('[EscrowRoute] Error getting job escrow:', error);
            res.status(500).json({
                error: 'Failed to get escrow',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
