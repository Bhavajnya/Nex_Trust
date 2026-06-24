/**
 * BullMQ Job Types for async processing
 */

export enum QueueName {
  AI_VERIFICATION = 'ai-verification',
  FRAUD_ANALYSIS = 'fraud-analysis',
  DISPUTE_RESOLUTION = 'dispute-resolution',
}

export interface AIVerificationJob {
  jobId: string;
  evidenceIds: string[];
  userId: string; // Who submitted the evidence
  requirements: string; // Job requirements to verify
  budget: number;
  metadata?: Record<string, unknown>;
}

export interface FraudAnalysisJob {
  evidenceId: string;
  jobId: string;
  fileHash: string;
  userId: string;
  contentType: string;
  metadata?: Record<string, unknown>;
}

export interface DisputeResolutionJob {
  jobId: string;
  disputeType: 'quality' | 'incomplete' | 'fraud' | 'other';
  reason: string;
  evidence?: string[];
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface AIVerificationResult {
  jobId: string;
  verdict: 'approved' | 'rejected' | 'needs_review';
  confidence: number; // 0-1
  completionScore: number; // 0-100
  requirementsMet: {
    [requirement: string]: boolean;
  };
  issues: string[];
  suggestedAction: 'release' | 'refund' | 'dispute';
  analysis: string; // AI's detailed analysis
  timestamp: number;
}

export interface FraudAnalysisResult {
  evidenceId: string;
  isFraudulent: boolean;
  riskScore: number; // 0-100
  issues: string[];
  matchedPreviousEvidence?: string[]; // Similar evidence IDs
  metadata?: Record<string, unknown>;
}

export interface JobQueueConfig {
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  timeout: number;
  removeOnComplete: boolean;
  removeOnFail: boolean;
}

export const QUEUE_CONFIG: Record<QueueName, JobQueueConfig> = {
  [QueueName.AI_VERIFICATION]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 60000, // 60 seconds for GPT-4 Vision
    removeOnComplete: false, // Keep for audit trail
    removeOnFail: false, // Keep for debugging
  },
  [QueueName.FRAUD_ANALYSIS]: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 500 },
    timeout: 30000,
    removeOnComplete: true,
    removeOnFail: false,
  },
  [QueueName.DISPUTE_RESOLUTION]: {
    attempts: 1,
    backoff: { type: 'fixed', delay: 1000 },
    timeout: 120000, // Disputes need more time for review
    removeOnComplete: false,
    removeOnFail: false,
  },
};
