"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationWorker = void 0;
const bullmq_1 = require("bullmq");
const reconciliation_1 = require("../services/reconciliation");
class ReconciliationWorker {
    constructor(redis, db, stripe) {
        this.redis = redis;
        this.db = db;
        this.stripe = stripe;
        this.queue = new bullmq_1.Queue('reconciliation', { connection: this.redis });
        this.reconciliationService = new reconciliation_1.ReconciliationService(this.db, this.stripe);
        this.worker = new bullmq_1.Worker('reconciliation', this.processJob.bind(this), {
            connection: this.redis,
            concurrency: 1,
        });
        this.setupEventListeners();
    }
    /**
     * Process reconciliation job
     */
    async processJob(job) {
        try {
            console.log(`[ReconciliationWorker] Processing job ${job.id}:`, job.data);
            const result = await this.reconciliationService.runReconciliationJob();
            console.log(`[ReconciliationWorker] Job ${job.id} completed:`, `${result.totalRecoveries} recovered, ${result.totalMismatches} mismatches`);
        }
        catch (error) {
            console.error(`[ReconciliationWorker] Job ${job.id} failed:`, error);
            throw error;
        }
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.worker.on('completed', (job) => {
            console.log(`[ReconciliationWorker] Job ${job.id} completed successfully`);
        });
        this.worker.on('failed', (job, err) => {
            console.error(`[ReconciliationWorker] Job ${job.id} failed:`, err.message);
        });
        this.worker.on('error', (err) => {
            console.error('[ReconciliationWorker] Worker error:', err);
        });
    }
    /**
     * Schedule a reconciliation job
     */
    async scheduleReconciliation(delayMs = 0) {
        const job = await this.queue.add('reconcile', {}, { delay: delayMs });
        console.log('[ReconciliationWorker] Scheduled reconciliation job:', job.id);
        return job.id;
    }
    /**
     * Setup recurring reconciliation (every 5 minutes)
     */
    async setupRecurringReconciliation() {
        try {
            // Remove old job if exists
            const existingJobs = await this.queue.getRepeatableJobs();
            for (const job of existingJobs) {
                if (job.name === 'reconcile') {
                    await this.queue.removeRepeatableByKey(job.key);
                }
            }
            // Add new recurring job (every 5 minutes)
            await this.queue.add('reconcile', {}, {
                repeat: {
                    pattern: '*/5 * * * *', // Every 5 minutes
                },
            });
            console.log('[ReconciliationWorker] Recurring reconciliation scheduled');
        }
        catch (error) {
            console.error('[ReconciliationWorker] Error setting up recurring job:', error);
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
exports.ReconciliationWorker = ReconciliationWorker;
