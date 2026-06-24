"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyCleanupWorker = void 0;
const bullmq_1 = require("bullmq");
const idempotency_1 = require("../services/idempotency");
class IdempotencyCleanupWorker {
    constructor(redis, db) {
        this.redis = redis;
        this.db = db;
        this.queue = new bullmq_1.Queue('idempotency-cleanup', { connection: this.redis });
        this.idempotencyService = new idempotency_1.IdempotencyService(this.db);
        this.worker = new bullmq_1.Worker('idempotency-cleanup', this.processCleanup.bind(this), {
            connection: this.redis,
            concurrency: 1,
        });
        this.setupEventListeners();
    }
    /**
     * Process cleanup job
     */
    async processCleanup(job) {
        try {
            console.log('[IdempotencyCleanupWorker] Starting cleanup job');
            const deletedCount = await this.idempotencyService.cleanupExpiredKeys();
            console.log(`[IdempotencyCleanupWorker] Cleanup completed: ${deletedCount} keys deleted`);
        }
        catch (error) {
            console.error('[IdempotencyCleanupWorker] Cleanup failed:', error);
            throw error;
        }
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.worker.on('completed', (job) => {
            console.log(`[IdempotencyCleanupWorker] Job ${job.id} completed`);
        });
        this.worker.on('failed', (job, err) => {
            console.error(`[IdempotencyCleanupWorker] Job ${job.id} failed:`, err.message);
        });
        this.worker.on('error', (err) => {
            console.error('[IdempotencyCleanupWorker] Worker error:', err);
        });
    }
    /**
     * Setup recurring cleanup (every hour)
     */
    async setupRecurringCleanup() {
        try {
            // Remove old job if exists
            const existingJobs = await this.queue.getRepeatableJobs();
            for (const job of existingJobs) {
                if (job.name === 'cleanup') {
                    await this.queue.removeRepeatableByKey(job.key);
                }
            }
            // Add new recurring job (every hour)
            await this.queue.add('cleanup', {}, {
                repeat: {
                    pattern: '0 * * * *', // Every hour
                },
            });
            console.log('[IdempotencyCleanupWorker] Recurring cleanup scheduled');
        }
        catch (error) {
            console.error('[IdempotencyCleanupWorker] Error setting up recurring job:', error);
            throw error;
        }
    }
    /**
     * Close worker
     */
    async close() {
        await this.worker.close();
        await this.queue.close();
    }
}
exports.IdempotencyCleanupWorker = IdempotencyCleanupWorker;
