"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationWorker = void 0;
const bullmq_1 = require("bullmq");
const types_1 = require("../queues/types");
const ai_verification_enhanced_1 = require("../services/ai-verification-enhanced");
const fraud_scorer_1 = require("../services/fraud-scorer");
const state_machine_1 = require("../services/state-machine");
/**
 * Verification Worker - Processes AI verification jobs from queue
 * Uses enhanced AI service that fetches actual evidence and analyzes with GPT-4o
 */
class VerificationWorker {
    constructor(redis, db, openaiKey, confidenceThreshold) {
        this.db = db;
        this.aiVerification = new ai_verification_enhanced_1.AIVerificationServiceEnhanced(db, openaiKey, confidenceThreshold);
        this.fraudScorer = new fraud_scorer_1.FraudScorer(db);
        this.stateMachine = new state_machine_1.StateMachineService(db);
        const queue = new bullmq_1.Queue(types_1.QueueName.AI_VERIFICATION, { connection: redis });
        this.worker = new bullmq_1.Worker(types_1.QueueName.AI_VERIFICATION, this.processJob.bind(this), {
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
    async moveToDeadLetterQueue(job, error) {
        try {
            const dlqEntry = {
                jobId: job.id,
                queueName: types_1.QueueName.AI_VERIFICATION,
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
        }
        catch (dlqError) {
            console.error('[VerificationWorker] Failed to log to DLQ:', dlqError);
        }
    }
    /**
     * Process AI verification job
     */
    async processJob(job) {
        const data = job.data;
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
            // Improved flow: EVIDENCE_SUBMITTED → AI_VERIFIED → (release guard) → RELEASED/DISPUTED
            if (verificationResult.verdict === 'approved') {
                // Mark as AI verified first (holds at release guard)
                await this.stateMachine.transitionState({
                    jobId: data.jobId,
                    fromState: 'EVIDENCE_SUBMITTED',
                    toState: 'AI_VERIFIED',
                    userId: 'system',
                    reason: `AI Verification: ${verificationResult.verdict} (confidence: ${verificationResult.confidence.toFixed(2)})`,
                    metadata: { verificationResult },
                });
            }
            else if (verificationResult.verdict === 'rejected') {
                // Automatically dispute rejected evidence
                await this.stateMachine.transitionState({
                    jobId: data.jobId,
                    fromState: 'EVIDENCE_SUBMITTED',
                    toState: 'DISPUTED',
                    userId: 'system',
                    reason: `AI Verification: Rejected (confidence: ${verificationResult.confidence.toFixed(2)}, issues: ${verificationResult.issues.join(', ')})`,
                    metadata: { verificationResult },
                });
            }
            else {
                // needs_review: keep in EVIDENCE_SUBMITTED for manual review
                console.log('[VerificationWorker] Verification needs manual review:', data.jobId);
            }
            console.log('[VerificationWorker] Completed verification for job:', data.jobId, 'verdict:', verificationResult.verdict);
            return verificationResult;
        }
        catch (error) {
            console.error('[VerificationWorker] Verification error:', error);
            throw error; // Retry the job
        }
    }
    /**
     * Start the worker
     */
    async start() {
        console.log('[VerificationWorker] Starting...');
        // Worker automatically starts processing
    }
    /**
     * Score all evidence for fraud in parallel
     */
    async scoreFraudForAllEvidence(evidenceIds, jobId, uploadedBy) {
        const fraudScores = await Promise.all(evidenceIds.map(async (evidenceId) => {
            try {
                const evidenceDoc = await this.db.collection('evidence').doc(evidenceId).get();
                if (evidenceDoc.exists) {
                    const evidence = evidenceDoc.data();
                    return await this.fraudScorer.scoreEvidence(evidenceId, jobId, evidence.fileHash, uploadedBy, evidence.contentType);
                }
                return null;
            }
            catch (error) {
                console.error('[VerificationWorker] Error scoring evidence:', evidenceId, error);
                return null;
            }
        }));
        return fraudScores.filter((score) => score !== null);
    }
    /**
     * Gracefully shutdown the worker
     */
    async shutdown() {
        console.log('[VerificationWorker] Shutting down...');
        await this.worker.close();
    }
}
exports.VerificationWorker = VerificationWorker;
