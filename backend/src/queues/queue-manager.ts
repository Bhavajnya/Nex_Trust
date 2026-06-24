import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QueueName, QUEUE_CONFIG, AIVerificationJob, FraudAnalysisJob, DisputeResolutionJob } from './types';

/**
 * Central queue manager for all async processing
 */
export class QueueManager {
  private queues: Map<QueueName, Queue> = new Map();
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl) as any;
    this.redis.on('error', (err) => console.error('[Redis] Error:', err));
    this.redis.on('connect', () => console.log('[Redis] Connected'));
  }

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    console.log('[QueueManager] Initializing queues...');

    try {
      // Try to connect to Redis first
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 2000);
        this.redis.once('ready', () => {
          clearTimeout(timeout);
          resolve(true);
        });
        this.redis.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Create queues
      for (const queueName of Object.values(QueueName)) {
        const config = QUEUE_CONFIG[queueName];

        const queue = new Queue(queueName, {
          connection: this.redis as any,
          defaultJobOptions: {
            attempts: config.attempts,
            backoff: config.backoff,
            removeOnComplete: config.removeOnComplete,
            removeOnFail: config.removeOnFail,
          },
        });

        this.queues.set(queueName, queue);

        console.log(`[QueueManager] Initialized queue: ${queueName}`);
      }
    } catch (err: any) {
      console.warn(`[QueueManager] Redis not available: ${err.message}`);
      console.warn('[QueueManager] Queues will be disabled (development mode)');
    }
  }

  /**
   * Get a specific queue
   */
  getQueue<T>(name: QueueName): Queue<T> {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue not found: ${name}`);
    }
    return queue as Queue<T>;
  }

  /**
   * Add job to verification queue
   */
  async queueAIVerification(job: AIVerificationJob): Promise<string> {
    const queue = this.getQueue<AIVerificationJob>(QueueName.AI_VERIFICATION);
    const result = await queue.add(`verify-${job.jobId}`, job, {
      jobId: job.jobId,
      priority: 5, // Medium priority
    });
    console.log('[QueueManager] Queued AI verification:', result.id);
    return result.id || '';
  }

  /**
   * Add job to fraud analysis queue
   */
  async queueFraudAnalysis(job: FraudAnalysisJob): Promise<string> {
    const queue = this.getQueue<FraudAnalysisJob>(QueueName.FRAUD_ANALYSIS);
    const result = await queue.add(`fraud-${job.evidenceId}`, job, {
      jobId: job.evidenceId,
      priority: 3, // Lower priority, runs after verification
    });
    console.log('[QueueManager] Queued fraud analysis:', result.id);
    return result.id || '';
  }

  /**
   * Add job to dispute resolution queue
   */
  async queueDisputeResolution(job: DisputeResolutionJob): Promise<string> {
    const queue = this.getQueue<DisputeResolutionJob>(QueueName.DISPUTE_RESOLUTION);
    const result = await queue.add(`dispute-${job.jobId}`, job, {
      jobId: job.jobId,
      priority: 8, // High priority, disputes need quick resolution
    });
    console.log('[QueueManager] Queued dispute resolution:', result.id);
    return result.id || '';
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<Record<QueueName, unknown>> {
    const stats: Record<string, unknown> = {};

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

    return stats as Record<QueueName, unknown>;
  }

  /**
   * Clean up old jobs
   */
  async cleanup(): Promise<void> {
    for (const queue of this.queues.values()) {
      // Remove completed jobs older than 24 hours
      await queue.clean(24 * 60 * 60 * 1000, 100);
    }
    console.log('[QueueManager] Cleanup complete');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[QueueManager] Shutting down...');

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    await this.redis.quit();
    console.log('[QueueManager] Shutdown complete');
  }
}
