"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueManager = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const types_1 = require("./types");
/**
 * Central queue manager for all async processing
 */
class QueueManager {
    constructor(redisUrl) {
        this.queues = new Map();
        this.schedulers = new Map();
        this.redis = new ioredis_1.default(redisUrl);
        this.redis.on('error', (err) => console.error('[Redis] Error:', err));
        this.redis.on('connect', () => console.log('[Redis] Connected'));
    }
    /**
     * Initialize all queues
     */
    async initialize() {
        console.log('[QueueManager] Initializing queues...');
        // Create queues
        for (const queueName of Object.values(types_1.QueueName)) {
            const config = types_1.QUEUE_CONFIG[queueName];
            const queue = new bullmq_1.Queue(queueName, {
                connection: this.redis,
                defaultJobOptions: {
                    attempts: config.attempts,
                    backoff: config.backoff,
                    timeout: config.timeout,
                    removeOnComplete: config.removeOnComplete,
                    removeOnFail: config.removeOnFail,
                },
            });
            // Setup scheduler for delayed/recurring jobs
            const scheduler = new bullmq_1.QueueScheduler(queueName, {
                connection: this.redis,
            });
            this.queues.set(queueName, queue);
            this.schedulers.set(queueName, scheduler);
            console.log(`[QueueManager] Initialized queue: ${queueName}`);
        }
    }
    /**
     * Get a specific queue
     */
    getQueue(name) {
        const queue = this.queues.get(name);
        if (!queue) {
            throw new Error(`Queue not found: ${name}`);
        }
        return queue;
    }
    /**
     * Add job to verification queue
     */
    async queueAIVerification(job) {
        const queue = this.getQueue(types_1.QueueName.AI_VERIFICATION);
        const result = await queue.add(`verify-${job.jobId}`, job, {
            jobId: job.jobId,
            priority: 5, // Medium priority
        });
        console.log('[QueueManager] Queued AI verification:', result.id);
        return result.id;
    }
    /**
     * Add job to fraud analysis queue
     */
    async queueFraudAnalysis(job) {
        const queue = this.getQueue(types_1.QueueName.FRAUD_ANALYSIS);
        const result = await queue.add(`fraud-${job.evidenceId}`, job, {
            jobId: job.evidenceId,
            priority: 3, // Lower priority, runs after verification
        });
        console.log('[QueueManager] Queued fraud analysis:', result.id);
        return result.id;
    }
    /**
     * Add job to dispute resolution queue
     */
    async queueDisputeResolution(job) {
        const queue = this.getQueue(types_1.QueueName.DISPUTE_RESOLUTION);
        const result = await queue.add(`dispute-${job.jobId}`, job, {
            jobId: job.jobId,
            priority: 8, // High priority, disputes need quick resolution
        });
        console.log('[QueueManager] Queued dispute resolution:', result.id);
        return result.id;
    }
    /**
     * Get queue statistics
     */
    async getStats() {
        const stats = {};
        for (const [name, queue] of this.queues) {
            const counts = await queue.getJobCounts();
            stats[name] = {
                active: counts.active,
                completed: counts.completed,
                failed: counts.failed,
                delayed: counts.delayed,
                waiting: counts.waiting,
            };
        }
        return stats;
    }
    /**
     * Clean up old jobs
     */
    async cleanup() {
        for (const queue of this.queues.values()) {
            // Remove completed jobs older than 24 hours
            await queue.clean(24 * 60 * 60 * 1000, 100);
        }
        console.log('[QueueManager] Cleanup complete');
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('[QueueManager] Shutting down...');
        for (const scheduler of this.schedulers.values()) {
            await scheduler.close();
        }
        for (const queue of this.queues.values()) {
            await queue.close();
        }
        await this.redis.quit();
        console.log('[QueueManager] Shutdown complete');
    }
}
exports.QueueManager = QueueManager;
