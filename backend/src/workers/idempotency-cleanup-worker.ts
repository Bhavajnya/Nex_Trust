import { Worker, Queue } from 'bullmq';
import { Firestore } from 'firebase-admin/firestore';
import Redis from 'ioredis';
import { IdempotencyService } from '../services/idempotency';

export class IdempotencyCleanupWorker {
  private queue: Queue;
  private worker: Worker;
  private idempotencyService: IdempotencyService;

  constructor(private redis: Redis, private db: Firestore) {
    const connection = this.redis as any;
    this.queue = new Queue('idempotency-cleanup', { connection });
    this.idempotencyService = new IdempotencyService(this.db);

    this.worker = new Worker('idempotency-cleanup', this.processCleanup.bind(this), {
      connection,
      concurrency: 1,
    });

    this.setupEventListeners();
  }

  /**
   * Process cleanup job
   */
  private async processCleanup(job: any): Promise<void> {
    try {
      console.log('[IdempotencyCleanupWorker] Starting cleanup job');

      const deletedCount = await this.idempotencyService.cleanupExpiredKeys();

      console.log(`[IdempotencyCleanupWorker] Cleanup completed: ${deletedCount} keys deleted`);
    } catch (error) {
      console.error('[IdempotencyCleanupWorker] Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: any) => {
      const jobId = job?.id || 'unknown';
      console.log(`[IdempotencyCleanupWorker] Job ${jobId} completed`);
    });

    this.worker.on('failed', (job: any, err: any) => {
      const jobId = job?.id || 'unknown';
      console.error(`[IdempotencyCleanupWorker] Job ${jobId} failed:`, err?.message);
    });

    this.worker.on('error', (err) => {
      console.error('[IdempotencyCleanupWorker] Worker error:', err);
    });
  }

  /**
   * Setup recurring cleanup (every hour)
   */
  async setupRecurringCleanup(): Promise<void> {
    try {
      // Remove old job if exists
      const existingJobs = await this.queue.getRepeatableJobs();
      for (const job of existingJobs) {
        if (job.name === 'cleanup') {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }

      // Add new recurring job (every hour)
      await this.queue.add(
        'cleanup',
        {},
        {
          repeat: {
            pattern: '0 * * * *', // Every hour
          },
        }
      );

      console.log('[IdempotencyCleanupWorker] Recurring cleanup scheduled');
    } catch (error) {
      console.error('[IdempotencyCleanupWorker] Error setting up recurring job:', error);
      throw error;
    }
  }

  /**
   * Close worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
