"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentRoutes = createPaymentRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const payment_1 = require("../services/payment");
const idempotency_1 = require("../services/idempotency");
const payment_state_coordinator_1 = require("../services/payment-state-coordinator");
const state_machine_1 = require("../services/state-machine");
const state_machine_guards_1 = require("../services/state-machine-guards");
const escrow_1 = require("../services/escrow");
const auth_1 = require("../middleware/auth");
const createPaymentSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    buyerId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().length(3),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const confirmPaymentSchema = zod_1.z.object({
    paymentId: zod_1.z.string().min(1),
    stripeIntentId: zod_1.z.string().min(1),
});
function createPaymentRoutes(db, stripe, transactionManager) {
    const router = (0, express_1.Router)();
    const idempotency = new idempotency_1.IdempotencyService(db);
    const paymentService = new payment_1.PaymentService(db, stripe, idempotency, transactionManager);
    const stateMachine = new state_machine_1.StateMachineService(db);
    const guards = new state_machine_guards_1.StateMachineGuards(db);
    const escrowService = new escrow_1.EscrowService(db, paymentService, transactionManager);
    const coordinator = new payment_state_coordinator_1.PaymentStateCoordinator(db, stateMachine, guards, paymentService, escrowService, stripe);
    // Apply authentication middleware
    router.use((0, auth_1.createAuthMiddleware)(db));
    /**
     * POST /payments/fund
     * Fund a job - creates payment AND transitions job state to FUNDED atomically
     */
    router.post('/fund', (0, auth_1.requireRole)(auth_1.UserRole.CUSTOMER), auth_1.requireIdempotencyKey, (0, auth_1.requireResourceOwnership)(db), async (req, res) => {
        try {
            const { jobId, amount, currency } = zod_1.z
                .object({
                jobId: zod_1.z.string().min(1),
                amount: zod_1.z.number().positive(),
                currency: zod_1.z.string().length(3),
            })
                .parse(req.body);
            const result = await coordinator.fundJobWithStateTransition({
                jobId,
                buyerId: req.user.uid,
                amount,
                currency,
                idempotencyKey: req.idempotencyKey,
                metadata: { initiatedBy: req.user.uid },
            });
            res.status(200).json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            console.error('[PaymentRoute] Error funding job:', error);
            res.status(500).json({
                error: 'Failed to fund job',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * POST /payments/confirm
     * Confirm a payment after Stripe charge (webhook handler)
     */
    router.post('/confirm', auth_1.requireIdempotencyKey, async (req, res) => {
        try {
            const { paymentId, stripeIntentId } = zod_1.z
                .object({
                paymentId: zod_1.z.string().min(1),
                stripeIntentId: zod_1.z.string().min(1),
            })
                .parse(req.body);
            await paymentService.confirmPayment({
                paymentId,
                stripeIntentId,
                idempotencyKey: req.idempotencyKey,
            });
            res.status(200).json({
                success: true,
                message: 'Payment confirmed',
                idempotencyKey: req.idempotencyKey,
            });
        }
        catch (error) {
            console.error('[PaymentRoute] Error confirming payment:', error);
            res.status(500).json({
                error: 'Failed to confirm payment',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * GET /payments/:paymentId
     * Get payment details
     */
    router.get('/:paymentId', async (req, res) => {
        try {
            const { paymentId } = req.params;
            const payment = await paymentService.getPayment(paymentId);
            if (!payment) {
                return res.status(404).json({ error: 'Payment not found' });
            }
            res.status(200).json({
                success: true,
                payment,
            });
        }
        catch (error) {
            console.error('[PaymentRoute] Error getting payment:', error);
            res.status(500).json({
                error: 'Failed to get payment',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * GET /payments/job/:jobId
     * Get all payments for a job
     */
    router.get('/job/:jobId', async (req, res) => {
        try {
            const { jobId } = req.params;
            const payments = await paymentService.getJobPayments(jobId);
            res.status(200).json({
                success: true,
                payments,
            });
        }
        catch (error) {
            console.error('[PaymentRoute] Error getting job payments:', error);
            res.status(500).json({
                error: 'Failed to get payments',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
