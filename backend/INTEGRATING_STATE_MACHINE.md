# Integrating State Machine into Existing Services

This guide shows how to integrate the centralized State Machine Service into the existing Payment, Escrow, and Reconciliation services.

## Overview

The state machine should be the **source of truth** for job state. Every service that changes job behavior should transition the state through the state machine.

```
Payment Service ──→ Confirms payment ──→ stateMachine.CREATED → FUNDED
                                                      ↓
                                              Job state updated
                                                      ↓
                                        Other services see FUNDED state
```

## Integration Pattern

### 1. Payment Service Integration

**Current behavior:** Payment service updates payment record status

**New behavior:** Payment service also transitions job state

**File:** `backend/src/services/payment.ts`

```typescript
import { stateMachine, JobState } from './state-machine';

export class PaymentService {
  async confirmPayment(paymentId: string, stripePaymentIntentId: string) {
    // ... existing payment confirmation logic ...

    // NEW: Transition job state
    const payment = await db.collection('payments').doc(paymentId).get();
    const jobId = (payment.data() as any).jobId;
    const buyerId = (payment.data() as any).buyerId;

    try {
      // Get current job state
      const currentState = await stateMachine.getJobState(jobId);
      
      if (currentState === JobState.CREATED) {
        // Only transition if in CREATED state
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.CREATED,
          toState: JobState.FUNDED,
          userId: buyerId,
          reason: 'Stripe payment intent succeeded',
          metadata: {
            paymentIntentId: stripePaymentIntentId,
            paymentId,
            amount: (payment.data() as any).amount,
            currency: (payment.data() as any).currency
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} to FUNDED`, { error });
      // Don't fail payment if state transition fails - log and alert
      await alertOpsTeam(`State transition failed for job ${jobId}`, error);
    }

    return { success: true, paymentId };
  }
}
```

### 2. Escrow Service Integration

**Current behavior:** Escrow service holds/releases funds

**New behavior:** Escrow service also transitions job state at key points

**File:** `backend/src/services/escrow.ts`

```typescript
import { stateMachine, JobState } from './state-machine';

export class EscrowService {
  async holdEscrow(jobId: string, freelancerId: string, amount: number) {
    // ... existing escrow holding logic ...

    // NEW: Transition job state when freelancer accepts
    try {
      const currentState = await stateMachine.getJobState(jobId);
      
      if (currentState === JobState.FUNDED) {
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.FUNDED,
          toState: JobState.ACCEPTED,
          userId: freelancerId,
          reason: 'Freelancer accepted job and funds held in escrow',
          metadata: {
            escrowId: escrowRecord.id,
            amount,
            blockchainTxHash: blockchainTxHash || undefined
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} to ACCEPTED`, { error });
      await alertOpsTeam(`Escrow held but state transition failed for ${jobId}`, error);
    }

    return { success: true, escrowId };
  }

  async releasePayment(jobId: string, freelancerId: string) {
    // ... existing release logic ...

    // NEW: Transition job state to RELEASED
    try {
      const currentState = await stateMachine.getJobState(jobId);
      
      if (currentState === JobState.AI_VERIFIED) {
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.AI_VERIFIED,
          toState: JobState.RELEASED,
          userId: 'system', // System auto-release
          reason: 'AI verification passed, payment released to freelancer',
          metadata: {
            releaseMethod: 'ai_verified',
            paymentMethod: 'blockchain' // or 'stripe'
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} to RELEASED`, { error });
      await alertOpsTeam(`Payment released but state transition failed for ${jobId}`, error);
    }

    return { success: true };
  }

  async refundPayment(jobId: string, reason: string) {
    // ... existing refund logic ...

    // NEW: Transition job state to CANCELLED or FAILED
    try {
      const currentState = await stateMachine.getJobState(jobId);
      
      const targetState = reason.includes('early') ? JobState.CANCELLED : JobState.FAILED;

      if (stateMachine.canTransition(currentState as JobState, targetState)) {
        await stateMachine.transitionState({
          jobId,
          fromState: currentState as JobState,
          toState: targetState,
          userId: 'system',
          reason: `Refund processed: ${reason}`,
          metadata: {
            refundReason: reason
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} for refund`, { error });
      await alertOpsTeam(`Refund processed but state transition failed for ${jobId}`, error);
    }

    return { success: true };
  }
}
```

### 3. Evidence/Upload Service Integration

**When freelancer uploads evidence:**

```typescript
export class EvidenceService {
  async submitEvidence(jobId: string, freelancerId: string, evidenceUrl: string, evidenceHash: string) {
    // ... existing evidence storage logic ...

    // NEW: Transition job state
    try {
      const currentState = await stateMachine.getJobState(jobId);
      
      if (currentState === JobState.IN_PROGRESS) {
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.IN_PROGRESS,
          toState: JobState.EVIDENCE_SUBMITTED,
          userId: freelancerId,
          reason: 'Freelancer submitted completion evidence',
          metadata: {
            evidenceUrl,
            evidenceHash,
            evidenceType: getEvidenceType(evidenceUrl),
            ipfsHash: ipfsHash,
            submittedAt: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} to EVIDENCE_SUBMITTED`, { error });
      throw error; // This is user-facing, so fail loudly
    }

    return { success: true, evidenceId };
  }
}
```

### 4. AI Verification Service Integration

**When AI verifies evidence:**

```typescript
export class AIVerificationService {
  async verifyEvidence(jobId: string, evidenceUrl: string): Promise<VerificationResult> {
    // ... existing AI verification logic ...
    const result = await openai.verifyCompletion(evidenceUrl);

    if (result.verified) {
      // NEW: Transition job state
      try {
        const currentState = await stateMachine.getJobState(jobId);
        
        if (currentState === JobState.EVIDENCE_SUBMITTED) {
          await stateMachine.transitionState({
            jobId,
            fromState: JobState.EVIDENCE_SUBMITTED,
            toState: JobState.AI_VERIFIED,
            userId: 'ai-system',
            reason: 'AI verification passed - work meets requirements',
            metadata: {
              verificationScore: result.confidenceScore,
              aiModel: 'gpt-4-vision',
              verificationDetails: result.details
            }
          });
        }
      } catch (error) {
        logger.error(`Failed to transition job ${jobId} to AI_VERIFIED`, { error });
        await alertOpsTeam(`Verification passed but state transition failed for ${jobId}`, error);
      }
    } else {
      // Evidence not verified
      logger.warn(`AI verification failed for job ${jobId}`, {
        reason: result.failureReason,
        score: result.confidenceScore
      });

      // Don't transition state - freelancer needs to resubmit
    }

    return result;
  }
}
```

### 5. Dispute Handling Service Integration

**When dispute is initiated:**

```typescript
export class DisputeService {
  async initiateDispute(jobId: string, initiatedBy: string, reason: string) {
    // ... existing dispute creation logic ...

    // NEW: Transition job state
    try {
      const currentState = await stateMachine.getJobState(jobId);
      
      // Can transition from several states
      if (stateMachine.canTransition(currentState as JobState, JobState.DISPUTED)) {
        await stateMachine.transitionState({
          jobId,
          fromState: currentState as JobState,
          toState: JobState.DISPUTED,
          userId: initiatedBy,
          reason: `Dispute initiated by ${initiatedBy === 'buyer' ? 'buyer' : 'freelancer'}`,
          metadata: {
            disputeReason: reason,
            initiatedBy,
            initiatedAt: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} to DISPUTED`, { error });
      throw error; // Fail loudly for dispute
    }

    return { success: true, disputeId };
  }

  async resolveDispute(jobId: string, resolution: 'release' | 'refund', arbitratorId: string) {
    // ... existing dispute resolution logic ...

    // NEW: Transition job state
    try {
      const currentState = await stateMachine.getJobState(jobId);
      
      if (currentState === JobState.DISPUTED) {
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.DISPUTED,
          toState: JobState.RESOLVED,
          userId: arbitratorId,
          reason: `Dispute resolved - ${resolution === 'release' ? 'payment released' : 'payment refunded'}`,
          metadata: {
            resolution,
            arbitratorId,
            arbitrationDetails: arbitrationDetails
          }
        });
      }

      // Then transition to final state based on resolution
      if (resolution === 'release') {
        // Next: RELEASED
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.RESOLVED,
          toState: JobState.RELEASED,
          userId: 'system',
          reason: 'Payment released after dispute resolution',
          metadata: { disputeId }
        });
      } else if (resolution === 'refund') {
        // Next: FAILED (with refund)
        await stateMachine.transitionState({
          jobId,
          fromState: JobState.RESOLVED,
          toState: JobState.FAILED,
          userId: 'system',
          reason: 'Payment refunded after dispute resolution',
          metadata: { disputeId }
        });
      }
    } catch (error) {
      logger.error(`Failed to transition job ${jobId} after dispute resolution`, { error });
      await alertOpsTeam(`Dispute resolved but state transition failed for ${jobId}`, error);
    }

    return { success: true };
  }
}
```

## Step-by-Step Integration Checklist

### Phase 1: Prepare Infrastructure
- [ ] Firestore collections created:
  - [ ] `jobs` (for main job records with state)
  - [ ] `state_transitions` (audit log)
  - [ ] `domain_events` (for event subscribers)
- [ ] Logger utility created and tested
- [ ] StateMachineService deployed and tested

### Phase 2: Migrate Existing Jobs
- [ ] Write migration script to populate states for existing jobs:
  ```typescript
  // For each job, determine current state based on payment/escrow status
  for (const job of allJobs) {
    const payment = await getPaymentRecord(job.id);
    const escrow = await getEscrowRecord(job.id);
    
    let state = JobState.CREATED;
    if (payment && payment.status === 'succeeded') state = JobState.FUNDED;
    if (escrow && escrow.status === 'held') state = JobState.ACCEPTED;
    // ... etc
    
    await db.collection('jobs').doc(job.id).update({ state });
  }
  ```
- [ ] Verify all jobs have valid states
- [ ] Run consistency checks

### Phase 3: Update Services (One at a Time)
1. [ ] Start with **Payment Service**
   - [ ] Add state transition on confirmPayment()
   - [ ] Test end-to-end payment flow
   - [ ] Monitor for errors
   - [ ] Deploy to production

2. [ ] Then **Escrow Service**
   - [ ] Add state transition on holdEscrow()
   - [ ] Add state transition on releasePayment()
   - [ ] Test complete workflow
   - [ ] Deploy to production

3. [ ] Then **Evidence Service** (if exists)
   - [ ] Add state transition on submitEvidence()
   - [ ] Test with real evidence uploads

4. [ ] Then **AI Verification Service** (if exists)
   - [ ] Add state transition on verifyEvidence()
   - [ ] Test verification flow

5. [ ] Then **Dispute Service** (if exists)
   - [ ] Add state transition on initiateDispute()
   - [ ] Add state transitions on resolveDispute()

### Phase 4: Add Monitoring
- [ ] Set up consistency checks to run every 5 minutes
- [ ] Set up alerts for invalid state transitions
- [ ] Set up alerts for failed transitions
- [ ] Create dashboard showing state distribution

### Phase 5: Testing
- [ ] Test complete workflow: CREATED → FUNDED → ... → RELEASED
- [ ] Test dispute workflow: ... → DISPUTED → RESOLVED → RELEASED
- [ ] Test cancellation: CREATED → FUNDED → CANCELLED
- [ ] Test error recovery: ... → FAILED
- [ ] Test forced transitions (admin recovery)

## Error Handling Pattern

All services should follow this pattern when transitioning state:

```typescript
try {
  await stateMachine.transitionState({
    jobId,
    fromState: currentState,
    toState: targetState,
    userId,
    reason,
    metadata
  });
} catch (error) {
  if (error.message.includes('Invalid state transition')) {
    // State is not where we expected
    logger.warn(`Expected ${currentState} but got something else for ${jobId}`);
    
    // Re-query current state and try to determine best course of action
    const actualState = await stateMachine.getJobState(jobId);
    // ... handle based on actual state
  } else {
    // Database or other error
    logger.error(`Failed to transition job ${jobId}`, { error });
    
    // For critical transitions, alert ops team
    if (isNewUserFirstJob) {
      await alertOpsTeam(`State transition failed for new user job`, error);
    }
  }
}
```

## Testing Template

```typescript
describe('Service with State Machine Integration', () => {
  it('should transition state on successful operation', async () => {
    // Setup
    const jobId = 'test-job-123';
    const userId = 'test-user-456';

    // Execute
    await service.confirmPayment(jobId);

    // Verify state transition
    const state = await stateMachine.getJobState(jobId);
    expect(state).toBe(JobState.FUNDED);

    // Verify history
    const history = await stateMachine.getTransitionHistory(jobId);
    expect(history).toContainEqual(
      expect.objectContaining({
        fromState: JobState.CREATED,
        toState: JobState.FUNDED,
        userId: userId,
        success: true
      })
    );

    // Verify audit log
    const transactions = await db
      .collection('transaction_logs')
      .where('jobId', '==', jobId)
      .where('operation', '==', 'state_transition')
      .get();
    expect(transactions.docs.length).toBeGreaterThan(0);
  });

  it('should not transition to invalid state', async () => {
    // Setup
    const jobId = 'test-job-123';
    await setJobState(jobId, JobState.RELEASED);

    // Execute & Verify
    await expect(
      service.transitionState({
        jobId,
        toState: JobState.DISPUTED, // Can't dispute RELEASED job
        userId: 'user'
      })
    ).rejects.toThrow('Invalid state transition');
  });
});
```

## Troubleshooting Integration Issues

### Issue: "Job not found" error
**Cause:** Job record doesn't exist in `jobs` collection
**Solution:** Ensure job record is created in `jobs` collection before trying to transition state

### Issue: "Invalid state transition"
**Cause:** Current state doesn't allow transition to target state
**Solution:** Check `getValidNextStates()` to see what transitions are allowed

### Issue: State transitions succeed but job state doesn't update
**Cause:** Firestore transaction failure or permission issue
**Solution:** Check Firestore RLS rules, verify service has write permissions

### Issue: Transition works in isolation but fails in production
**Cause:** Race condition - multiple requests transitioning simultaneously
**Solution:** Add optimistic locking or check-and-set pattern

## Rollback Plan

If state machine integration causes issues:

1. **Immediate:** Remove state-machine imports from services (they'll still work, just won't transition state)
2. **Short term:** Keep running both old and new logic side-by-side for comparison
3. **Long term:** Implement "state repair" background job that fixes inconsistencies

## Performance Impact

- **State transition:** ~5ms (O(1) validation + Firestore write)
- **Get current state:** ~2ms (Firestore read)
- **Transition history:** ~50ms for 100 transitions (Firestore query)
- **Overall:** Negligible impact on request latency

## Next Steps After Integration

Once state machine is integrated, you can:

1. Build **event subscribers** to react to state changes (Priority 2)
2. Implement **background job queue** for async operations (Priority 2)
3. Add **fraud detection** that uses state transitions (Priority 3)
4. Create **analytics** based on state transition patterns
