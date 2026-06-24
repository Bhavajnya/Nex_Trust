import { Timestamp } from 'firebase-admin/firestore';
import { JobState } from '../services/state-machine';

/**
 * Evidence Status Flow
 * PENDING_UPLOAD: File is being uploaded
 * UPLOADED: File stored successfully, awaiting verification
 * UNDER_VERIFICATION: AI/GPS verification in progress
 * VERIFIED: Evidence passed verification, ready for release
 * REJECTED: Evidence failed verification
 */
export enum EvidenceStatus {
  PENDING_UPLOAD = 'PENDING_UPLOAD',
  UPLOADED = 'UPLOADED',
  UNDER_VERIFICATION = 'UNDER_VERIFICATION',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export interface Job {
  id: string;
  jobId: string;
  buyerId: string;
  freelancerId: string;
  amount: number;
  currency: string;
  
  // State management
  state: JobState;
  previousState?: JobState;
  version: number; // For optimistic locking (prevents race conditions)
  
  // Transition history mapping state to timestamp
  transitionHistory: {
    [state: string]: Timestamp;
  };
  
  // Last state change details
  lastStateChange: {
    fromState: JobState;
    toState: JobState;
    timestamp: Timestamp;
    userId: string;
    reason?: string;
    forced?: boolean;
  };
  
  // Job details
  title: string;
  description: string;
  deadline?: Timestamp;
  
  // Related records
  paymentRecordId?: string;
  escrowRecordId?: string;
  
  // Metadata
  metadata?: Record<string, unknown>;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IdempotencyKey {
  key: string;
  requestHash: string;
  result: unknown;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface PaymentRecord {
  id: string;
  jobId: string;
  buyerId: string;
  amount: number;
  currency: string;
  stripePaymentIntentId: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EscrowRecord {
  id: string;
  jobId: string;
  buyerId: string;
  freelancerId: string;
  amount: number;
  currency: string;
  blockchainTxHash?: string;
  contractAddress?: string;
  status: 'held' | 'released' | 'refunded' | 'disputed';
  paymentRecordId: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentEscrowSnapshot {
  paymentId: string;
  escrowId: string;
  jobId: string;
  status: 'synced' | 'payment_pending' | 'escrow_pending' | 'mismatched' | 'failed';
  paymentStatus: string;
  escrowStatus: string;
  amount: number;
  currency: string;
  lastVerifiedAt: Timestamp;
  reconciliationAttempts: number;
  lastReconciliationError?: string;
}

export interface ReconciliationJob {
  id: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  status: 'running' | 'completed' | 'failed';
  totalProcessed: number;
  totalMismatches: number;
  totalRecoveries: number;
  errors: Array<{
    paymentId: string;
    escrowId?: string;
    error: string;
    timestamp: Timestamp;
  }>;
  metadata: Record<string, unknown>;
}

export interface TransactionLog {
  id: string;
  operation: 'payment_created' | 'escrow_created' | 'payment_confirmed' | 'escrow_held' | 'release' | 'refund' | 'reconciliation' | 'state_transition';
  status: 'initiated' | 'processing' | 'completed' | 'failed' | 'rolled_back';
  paymentId?: string;
  escrowId?: string;
  jobId?: string;
  details: Record<string, unknown>;
  error?: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

export interface StateTransitionRecord {
  id: string;
  jobId: string;
  fromState: JobState;
  toState: JobState;
  userId: string;
  reason?: string;
  metadata: Record<string, unknown>;
  success: boolean;
  error?: string;
  createdAt: Timestamp;
}

export interface DomainEvent {
  id: string;
  jobId: string;
  type: string;
  fromState: JobState;
  toState: JobState;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
  processed: boolean;
}
