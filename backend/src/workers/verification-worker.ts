import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { Firestore } from 'firebase-admin/firestore';
import { Queue, Worker } from 'bullmq';
import { AIVerificationJob, QueueName, AIVerificationResult } from '../queues/types';
import { AIVerificationServiceEnhanced } from '../services/ai-verification-enhanced';
import { FraudScorer } from '../services/fraud-scorer';
import { StateMachineService } from '../services/state-machine';
import { PaymentStateCoordinator } from '../services/payment-state-coordinator';
import { StateMachineGuards } from '../services/state-machine-guards';
import { PaymentService } from '../services/payment';
import { EscrowService } from '../services/escrow';
import { IdempotencyService } from '../services/idempotency';
import { TransactionManager } from '../services/transaction-manager';
import Stripe from 'stripe';

/**
 * Verification Worker - Processes AI verification jobs from queue
 * Uses enhanced AI service that fetches actual evidence and analyzes with GPT-4o
 */
export class VerificationWorker {
  private worker: Worker;
  private aiVerification: AIVerificationServiceEnhanced;
  private fraudScorer: FraudScorer;
  private stateMachine: StateMachineService;
  private paymentCoordinator: PaymentStateCoordinator;
  private db: Firestore;

  constructor(
    redis: Redis,
    db: Firestore,
    openaiKey: string,
    confidenceThreshold: number,
    stripeKey?: string
  ) {
    this.db = db;
    this.aiVerification = new AIVerificationServiceEnhanced(db, openaiKey, confidenceThreshold);
    this.fraudScorer = new FraudScorer(db);
    this.stateMachine = new StateMachineService(db);

    // Initialize payment coordinator for automatic release after verification
    const stripe = new Stripe(stripeKey || process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-20.acacia',
    });
    const guards = new StateMachineGuards(db);
    const paymentService = new PaymentService(db, stripe);
    const idempotency = new IdempotencyService(db);
    const transactionManager = new TransactionManager(db);
    const escrowService = new EscrowService(db, idempotency, transactionManager);

    this.paymentCoordinator = new PaymentStateCoordinator(
      db,
      this.stateMachine,
      guards,
      paymentService,
      escrowService,
      stripe
    );

    const queue = new Queue(QueueName.AI_VERIFICATION, { connection: redis });

    this.worker = new Worker(QueueName.AI_VERIFICATION, this.processJob.bind(this), {
      connection: redis,
      concurrency: 1, // Process one verification at a time to avoid rate limits
      settings: {
        maxStalledCount: 2, // Max times a job can stall
        lockDuration: 60000, // 60 second lock
        lockRenewTime: 5000, // Renew every 5 seconds
      },
    });

    // Event handlers with Dead Letter Queue support
    this.worker.on('completed', (job) => {
      console.log('[VerificationWorker] Job completed:', job.id);
    });

    this.worker.on('failed', (job, error) => {
      console.error('[VerificationWorker] Job failed:', job?.id, error.message);
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        this.moveToDeadLetterQueue(job, error);
      }
    });

    this.worker.on('stalled', (jobId) => {
      console.warn('[VerificationWorker] Job stalled:', jobId, '- will retry or move to DLQ');
    });

    this.worker.on('error', (error) => {
      console.error('[VerificationWorker] Worker error:', error);
    });
  }

  /**
   * Move failed job to dead letter queue for manual review
   */
  private async moveToDeadLetterQueue(job: any, error: Error): Promise<void> {
    try {
      const dlqEntry = {
        jobId: job.id,
        queueName: QueueName.AI_VERIFICATION,
        jobData: job.data,
        error: error.message,
        stack: error.stack,
        attempts: job.attemptsMade,
        failedAt: new Date(),
        status: 'pending_manual_review',
      };

      // Store in Firestore for admin review
      await this.db.collection('dead_letter_queue').doc(job.id).set(dlqEntry);

      console.log('[VerificationWorker] Job moved to DLQ:', job.id);
    } catch (dlqError) {
      console.error('[VerificationWorker] Failed to log to DLQ:', dlqError);
    }
  }

  /**
   * Process AI verification job
   */
  private async processJob(job: any): Promise<AIVerificationResult> {
    const data = job.data as AIVerificationJob;
    console.log('[VerificationWorker] Processing verification for job:', data.jobId);

    try {
      // Step 1 & 2: Run AI verification and fraud scoring in parallel
      const [verificationResult, fraudScores] = await Promise.all([
        this.aiVerification.verifyCompletion({
          jobId: data.jobId,
          evidenceIds: data.evidenceIds,
          requirements: data.requirements,
          budget: data.budget,
        }),
        this.scoreFraudForAllEvidence(data.evidenceIds, data.jobId, data.uploadedBy),
      ]);

      console.log('[VerificationWorker] AI and fraud scoring complete:', {
        jobId: data.jobId,
        aiVerdict: verificationResult.verdict,
        fraudCount: fraudScores.length,
      });

      // Step 3: Transition job state based on verdict
      // Improved flow: EVIDENCE_SUBMITTED → VERIFIED → (release guard) → RELEASED/DISPUTED
      if (verificationResult.verdict === 'approved') {
        // Mark as verified first (holds at release guard)
        console.log('[VerificationWorker] Transitioning to VERIFIED:', {
          jobId: data.jobId,
          confidence: verificationResult.confidence.toFixed(2),
          timestamp: new Date().toISOString(),
        });

        await this.stateMachine.transitionState({
          jobId: data.jobId,
          fromState: 'EVIDENCE_SUBMITTED',
          toState: 'VERIFIED',
          userId: 'system',
          reason: `Verification: ${verificationResult.verdict} (confidence: ${verificationResult.confidence.toFixed(2)})`,
          metadata: { verificationResult },
        });

        console.log('[VerificationWorker] Successfully transitioned to VERIFIED:', data.jobId);

        // Step 4: Automatically release payment after verified
        console.log('[VerificationWorker] Auto-releasing payment for verified job:', {
          jobId: data.jobId,
          timestamp: new Date().toISOString(),
        });
        try {
          const releaseResult = await this.paymentCoordinator.releasePaymentWithStateTransition({
            jobId: data.jobId,
            userId: 'system',
            reason: `Auto-release after AI verification approved (confidence: ${verificationResult.confidence.toFixed(2)})`,
          });
          console.log('[VerificationWorker] Payment successfully released:', {
            jobId: data.jobId,
            releasedAmount: releaseResult.releasedAmount,
            timestamp: new Date().toISOString(),
          });
        } catch (paymentError) {
          console.error(
            '[VerificationWorker] Failed to auto-release payment:',
            {
              jobId: data.jobId,
              error: paymentError instanceof Error ? paymentError.message : String(paymentError),
              timestamp: new Date().toISOString(),
            }
          );
          // Don't throw - job is already VERIFIED, just log the error
          // Payment can be released manually if needed
        }
      } else if (verificationResult.verdict === 'rejected') {
        // Automatically dispute rejected evidence
        await this.stateMachine.transitionState({
          jobId: data.jobId,
          fromState: 'EVIDENCE_SUBMITTED',
          toState: 'DISPUTED',
          userId: 'system',
          reason: `AI Verification: Rejected (confidence: ${verificationResult.confidence.toFixed(2)}, issues: ${verificationResult.issues.join(', ')})`,
          metadata: { verificationResult },
        });
      } else {
        // needs_review: keep in EVIDENCE_SUBMITTED for manual review
        console.log('[VerificationWorker] Verification needs manual review:', data.jobId);
      }

      console.log('[VerificationWorker] Completed verification for job:', data.jobId, 'verdict:', verificationResult.verdict);
      return verificationResult;
    } catch (error) {
      console.error('[VerificationWorker] Verification error:', error);
      throw error; // Retry the job
    }
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    console.log('[VerificationWorker] Starting...');
    // Worker automatically starts processing
  }

  /**
   * Score all evidence for fraud in parallel
   */
  private async scoreFraudForAllEvidence(
    evidenceIds: string[],
    jobId: string,
    uploadedBy: string
  ): Promise<any[]> {
    const fraudScores = await Promise.all(
      evidenceIds.map(async (evidenceId) => {
        try {
          const evidenceDoc = await this.db.collection('evidence').doc(evidenceId).get();
          if (evidenceDoc.exists) {
            const evidence = evidenceDoc.data() as any;
            return await this.fraudScorer.scoreEvidence(
              evidenceId,
              jobId,
              evidence.fileHash,
              uploadedBy,
              evidence.contentType
            );
          }
          return null;
        } catch (error) {
          console.error('[VerificationWorker] Error scoring evidence:', evidenceId, error);
          return null;
        }
      })
    );

    return fraudScores.filter((score) => score !== null);
  }

  /**
   * Gracefully shutdown the worker
   */
  async shutdown(): Promise<void> {
    console.log('[VerificationWorker] Shutting down...');
    await this.worker.close();
  }
}
