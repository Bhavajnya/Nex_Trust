"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const stripe_1 = __importDefault(require("stripe"));
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
const firebase_1 = require("./firebase");
const payments_1 = require("./routes/payments");
const escrow_1 = require("./routes/escrow");
const reconciliation_1 = require("./routes/reconciliation");
const evidence_1 = require("./routes/evidence");
const disputes_1 = require("./routes/disputes");
const jobs_1 = require("./routes/jobs");
const auth_1 = require("./routes/auth");
const auth_2 = require("firebase-admin/auth");
const auth_3 = require("./middleware/auth");
const reconciliation_worker_1 = require("./workers/reconciliation-worker");
const idempotency_cleanup_worker_1 = require("./workers/idempotency-cleanup-worker");
const state_machine_1 = __importDefault(require("./routes/state-machine"));
const transaction_manager_1 = require("./services/transaction-manager");
const queue_manager_1 = require("./queues/queue-manager");
async function startServer() {
    (0, config_1.validateConfig)();
    // Initialize Firebase
    const db = (0, firebase_1.initializeFirebase)();
    const auth = (0, auth_2.getAuth)();
    // Initialize Stripe
    const stripe = new stripe_1.default(config_1.config.stripeSecretKey, {
        apiVersion: '2023-10-16',
    });
    // Initialize Redis
    const redis = new ioredis_1.default(config_1.config.redisUrl);
    redis.on('error', (err) => console.error('[Redis] Error:', err));
    redis.on('connect', () => console.log('[Redis] Connected'));
    // Initialize Queue Manager
    const queueManager = new queue_manager_1.QueueManager(config_1.config.redisUrl);
    await queueManager.initialize();
    // Initialize Transaction Manager (handles atomic money flows)
    const transactionManager = new transaction_manager_1.TransactionManager(db);
    // Create Express app
    const app = (0, express_1.default)();
    // Middleware
    app.use((0, cors_1.default)({ origin: config_1.config.corsOrigin }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
    // Health check
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
    // Routes
    app.use('/api/auth', (0, auth_1.createAuthRoutes)(db, auth));
    // Protected routes (require Firebase auth)
    const authMiddleware = (0, auth_3.createAuthMiddleware)(db);
    app.use('/api/jobs', authMiddleware, (0, jobs_1.createJobRoutes)(db));
    app.use('/api/payments', authMiddleware, (0, payments_1.createPaymentRoutes)(db, stripe, transactionManager));
    app.use('/api/escrow', authMiddleware, (0, escrow_1.createEscrowRoutes)(db, transactionManager));
    app.use('/api/evidence', authMiddleware, (0, evidence_1.createEvidenceRoutes)(db, queueManager));
    app.use('/api/disputes', authMiddleware, (0, disputes_1.createDisputeRoutes)(db, transactionManager));
    app.use('/api/state-machine', authMiddleware, state_machine_1.default);
    // Initialize workers
    const reconciliationWorker = new reconciliation_worker_1.ReconciliationWorker(redis, db, stripe, transactionManager);
    const idempotencyCleanupWorker = new idempotency_cleanup_worker_1.IdempotencyCleanupWorker(redis, db);
    // Setup recurring jobs
    await reconciliationWorker.setupRecurringReconciliation();
    await idempotencyCleanupWorker.setupRecurringCleanup();
    // Reconciliation routes (depends on worker)
    app.use('/api/reconciliation', (0, reconciliation_1.createReconciliationRoutes)(db, stripe, redis, reconciliationWorker, transactionManager));
    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('[Server] Error:', err);
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Unknown error',
        });
    });
    // Start server
    const server = app.listen(config_1.config.port, () => {
        console.log(`\n[Server] Magic Handshake Backend`);
        console.log(`[Server] Running on port ${config_1.config.port}`);
        console.log(`[Server] Environment: ${config_1.config.nodeEnv}`);
        console.log(`[Server] API URL: ${config_1.config.apiUrl}\n`);
    });
    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\n[Server] Received ${signal}, shutting down...`);
        server.close(async () => {
            console.log('[Server] HTTP server closed');
            try {
                await reconciliationWorker.close();
                await idempotencyCleanupWorker.close();
                console.log('[Server] Workers closed');
            }
            catch (err) {
                console.error('[Server] Error closing workers:', err);
            }
            try {
                await queueManager.shutdown();
                console.log('[Server] Queue manager closed');
            }
            catch (err) {
                console.error('[Server] Error closing queue manager:', err);
            }
            try {
                await redis.quit();
                console.log('[Server] Redis connection closed');
            }
            catch (err) {
                console.error('[Server] Error closing Redis:', err);
            }
            process.exit(0);
        });
        // Force close after 10 seconds
        setTimeout(() => {
            console.error('[Server] Forced shutdown');
            process.exit(1);
        }, 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
// Start
startServer().catch((error) => {
    console.error('[Server] Startup failed:', error);
    process.exit(1);
});
