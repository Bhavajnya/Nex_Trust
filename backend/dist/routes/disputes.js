"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDisputeRoutes = createDisputeRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const dispute_1 = require("../services/dispute");
const escrow_1 = require("../services/escrow");
const idempotency_1 = require("../services/idempotency");
const auth_1 = require("../middleware/auth");
function createDisputeRoutes(db, transactionManager) {
    const router = (0, express_1.Router)();
    // Initialize services
    const idempotencyService = new idempotency_1.IdempotencyService(db);
    const escrowService = new escrow_1.EscrowService(db, idempotencyService, transactionManager);
    const disputeService = new dispute_1.DisputeService(db, escrowService, idempotencyService);
    // Apply authentication middleware
    router.use((0, auth_1.createAuthMiddleware)(db));
    /**
     * GET /disputes/pending
     * Get pending disputes for admin review
     */
    router.get('/pending', (0, auth_1.requireRole)(auth_1.UserRole.ADMIN), async (req, res) => {
        try {
            const disputes = await disputeService.getPendingDisputes();
            res.status(200).json({
                success: true,
                count: disputes.length,
                disputes,
            });
        }
        catch (error) {
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
    router.get('/:disputeId', async (req, res) => {
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
            const isAdmin = req.user?.roles.includes(auth_1.UserRole.ADMIN);
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
        }
        catch (error) {
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
    router.get('/job/:jobId', async (req, res) => {
        try {
            const { jobId } = req.params;
            const disputes = await disputeService.getJobDisputes(jobId);
            res.status(200).json({
                success: true,
                count: disputes.length,
                disputes,
            });
        }
        catch (error) {
            console.error('[DisputeRoute] Error getting job disputes:', error);
            res.status(500).json({
                error: 'Failed to get job disputes',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * POST /disputes/resolve/:disputeId
     * Resolve dispute with admin decision
     */
    router.post('/resolve/:disputeId', (0, auth_1.requireRole)(auth_1.UserRole.ADMIN), auth_1.requireIdempotencyKey, async (req, res) => {
        try {
            const { disputeId } = req.params;
            const { decision, freelancerPercentage, reasoning } = zod_1.z
                .object({
                decision: zod_1.z.enum(['release', 'refund', 'split']),
                freelancerPercentage: zod_1.z.number().min(0).max(100).optional(),
                reasoning: zod_1.z.string().min(10),
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
                resolvedBy: req.user.uid,
            });
            res.status(200).json({
                success: true,
                dispute: resolvedDispute,
                message: `Dispute resolved: ${decision} (freelancer: ${resolvedDispute.resolution?.freelancerAmount || 0})`,
            });
        }
        catch (error) {
            console.error('[DisputeRoute] Error resolving dispute:', error);
            res.status(500).json({
                error: 'Failed to resolve dispute',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * GET /disputes/stats
     * Get dispute statistics
     */
    router.get('/stats', (0, auth_1.requireRole)(auth_1.UserRole.ADMIN), async (req, res) => {
        try {
            const stats = await disputeService.getDisputeStats();
            res.status(200).json({
                success: true,
                stats,
            });
        }
        catch (error) {
            console.error('[DisputeRoute] Error getting stats:', error);
            res.status(500).json({
                error: 'Failed to get dispute stats',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
