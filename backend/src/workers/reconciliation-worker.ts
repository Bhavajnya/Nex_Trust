import { Worker, Queue } from 'bullmq';
import { Firestore } from 'firebase-admin/firestore';
import Redis from 'ioredis';
import { ReconciliationService } from '../services/reconciliation';
import { TransactionManager } from '../services/transaction-manager';
import Stripe from 'stripe';

export class ReconciliationWorker {
  private queue: Queue;
  private worker: Worker;
  private reconciliationService: ReconciliationService;

  constructor(
    private redis: Redis,
    private db: Firestore,
    private stripe: Stripe
  ) {
    const connection = this.redis as any;
    this.queue = new Queue('reconciliation', { connection });
    const transactionManager = new TransactionManager(this.db);
    this.reconciliationService = new ReconciliationService(this.db, this.stripe, transactionManager);

    this.worker = new Worker('reconciliation', this.processJob.bind(this), {
      connection,
      concurrency: 1,
    });

    this.setupEventListeners();
  }

  /**
   * Process reconciliation job
   */
  private async processJob(job: any): Promise<void> {
    try {
      const jobId = job?.id || 'unknown';
      console.log(`[ReconciliationWorker] Processing job ${jobId}:`, job?.data);

      const result = await this.reconciliationService.runReconciliationJob();

      console.log(
        `[ReconciliationWorker] Job ${jobId} completed:`,
        `${result.totalRecoveries} recovered, ${result.totalMismatches} mismatches`
      );
    } catch (error) {
      console.error(`[ReconciliationWorker] Job failed:`, error);
      throw error;
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: any) => {
      const jobId = job?.id || 'unknown';
      console.log(`[ReconciliationWorker] Job ${jobId} completed successfully`);
    });

    this.worker.on('failed', (job: any, err: any) => {
      const jobId = job?.id || 'unknown';
      console.error(`[ReconciliationWorker] Job ${jobId} failed:`, err?.message);
    });

    this.worker.on('error', (err) => {
      console.error('[ReconciliationWorker] Worker error:', err);
    });
  }

  /**
   * Schedule a reconciliation job
   */
  async scheduleReconciliation(delayMs: number = 0): Promise<string> {
    const job = await this.queue.add('reconcile', {}, { delay: delayMs });
    console.log('[ReconciliationWorker] Scheduled reconciliation job:', job.id || 'unknown');
    return job.id || '';
  }

  /**
   * Setup recurring reconciliation (every 5 minutes)
   */
  async setupRecurringReconciliation(): Promise<void> {
    try {
      // Remove old job if exists
      const existingJobs = await this.queue.getRepeatableJobs();
      for (const job of existingJobs) {
        if (job.name === 'reconcile') {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }

      // Add new recurring job (every 5 minutes)
      await this.queue.add(
        'reconcile',
        {},
        {
          repeat: {
            pattern: '*/5 * * * *', // Every 5 minutes
          },
        }
      );

      console.log('[ReconciliationWorker] Recurring reconciliation scheduled');
    } catch (error) {
      console.error('[ReconciliationWorker] Error setting up recurring job:', error);
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
