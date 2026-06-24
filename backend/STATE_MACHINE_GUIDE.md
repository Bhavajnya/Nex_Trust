# Centralized State Machine Service

## Overview

The **StateMachineService** is the foundational service that ensures job state integrity across the entire Magic Handshake platform. It validates every state transition, rejects invalid transitions, records history, emits domain events, and maintains an immutable audit log.

## Why a Centralized State Machine?

Without a centralized state machine, bugs can allow:
- `CREATED` → `RELEASED` (skip payment entirely)
- `DISPUTED` → `RELEASED` (release money during dispute)
- `IN_PROGRESS` → `RELEASED` (skip evidence submission)

These catastrophic state corruptions break the platform and lose user funds. A centralized state machine prevents all of them.

## Job State Diagram

```
                    ┌─────────┐
                    │ CREATED │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ FUNDED  │
                    └────┬────┘
                         │
                    ┌────▼────────┐
                    │ ACCEPTED   │
                    └────┬────────┘
                         │
                 ┌───────▼────────┐
                 │  IN_PROGRESS   │
                 └───┬──────────┬─┘
                     │          │
           ┌─────────▼──┐  ┌───▼────────┐
           │ EVIDENCE   │  │ DISPUTED   │
           │_SUBMITTED  │  └───┬────────┘
           └──────┬─────┘      │
                  │      ┌──────▼──┐
           ┌──────▼──┐   │ RESOLVED│
           │AI_VERIFIED   └──────┬─┘
           └──────┬──────────────┘
                  │
            ┌─────▼─────┐
            │ RELEASED  │
            └───────────┘
```

## Available States

| State | Description | Allowed Transitions |
|-------|-------------|-------------------|
| `CREATED` | Job created, awaiting payment | FUNDED, CANCELLED |
| `FUNDED` | Payment received, awaiting acceptance | ACCEPTED, FAILED, CANCELLED |
| `ACCEPTED` | Freelancer accepted, starting work | IN_PROGRESS, FAILED, CANCELLED |
| `IN_PROGRESS` | Work in progress | EVIDENCE_SUBMITTED, DISPUTED, FAILED |
| `EVIDENCE_SUBMITTED` | Freelancer submitted proof of completion | AI_VERIFIED, DISPUTED, FAILED |
| `AI_VERIFIED` | AI verified completion, ready for release | RELEASED, DISPUTED, FAILED |
| `RELEASED` | Payment released to freelancer | (Terminal) |
| `DISPUTED` | Dispute initiated | RESOLVED |
| `RESOLVED` | Dispute resolved | RELEASED |
| `CANCELLED` | Job cancelled (refund issued) | (Terminal) |
| `FAILED` | Job failed (refund issued) | (Terminal) |

## API Endpoints

### 1. Get All Available States
```bash
GET /api/state-machine/states
```

Response:
```json
{
  "states": ["CREATED", "FUNDED", "ACCEPTED", ...],
  "descriptions": {
    "CREATED": "Job created, waiting for payment",
    ...
  }
}
```

### 2. Get Valid Next States for Current State
```bash
GET /api/state-machine/valid-transitions/:state

Example:
GET /api/state-machine/valid-transitions/IN_PROGRESS
```

Response:
```json
{
  "currentState": "IN_PROGRESS",
  "validNextStates": ["EVIDENCE_SUBMITTED", "DISPUTED", "FAILED"],
  "count": 3
}
```

### 3. Check If Transition Is Valid (Without Performing)
```bash
POST /api/state-machine/can-transition

{
  "jobId": "job-123",
  "toState": "RELEASED"
}
```

Response:
```json
{
  "jobId": "job-123",
  "currentState": "IN_PROGRESS",
  "targetState": "RELEASED",
  "canTransition": false,
  "validNextStates": ["EVIDENCE_SUBMITTED", "DISPUTED", "FAILED"]
}
```

### 4. Perform a State Transition
```bash
POST /api/state-machine/transition

{
  "jobId": "job-123",
  "toState": "EVIDENCE_SUBMITTED",
  "reason": "Freelancer uploaded completion evidence",
  "metadata": {
    "evidenceHash": "abc123...",
    "evidenceUrl": "s3://..."
  }
}
```

Response:
```json
{
  "success": true,
  "jobId": "job-123",
  "fromState": "IN_PROGRESS",
  "toState": "EVIDENCE_SUBMITTED",
  "timestamp": "2024-06-23T10:30:00Z"
}
```

**Important:** Invalid transitions return a 400 error with valid alternatives:
```json
{
  "error": "Invalid state transition: CREATED → RELEASED",
  "currentState": "CREATED",
  "validNextStates": ["FUNDED", "CANCELLED"]
}
```

### 5. Get Transition History for a Job
```bash
GET /api/state-machine/history/:jobId

Example:
GET /api/state-machine/history/job-123
```

Response:
```json
{
  "jobId": "job-123",
  "transitionCount": 5,
  "transitions": [
    {
      "id": "transition-1",
      "jobId": "job-123",
      "fromState": "CREATED",
      "toState": "FUNDED",
      "userId": "buyer-456",
      "reason": "Payment processed",
      "success": true,
      "createdAt": "2024-06-23T09:00:00Z"
    },
    ...
  ],
  "events": [
    {
      "id": "event-1",
      "type": "state.created.funded",
      "fromState": "CREATED",
      "toState": "FUNDED",
      "createdAt": "2024-06-23T09:00:00Z",
      "processed": true
    },
    ...
  ]
}
```

### 6. Validate State Consistency
```bash
GET /api/state-machine/consistency/:jobId

Example:
GET /api/state-machine/consistency/job-123
```

Response (if valid):
```json
{
  "jobId": "job-123",
  "valid": true,
  "issues": []
}
```

Response (if issues found):
```json
{
  "jobId": "job-123",
  "valid": false,
  "issues": [
    "Job in FUNDED state but no payment record found",
    "Job in IN_PROGRESS state but no escrow record found"
  ]
}
```

### 7. Force a State Transition (Admin Only)
```bash
POST /api/state-machine/force-transition

{
  "jobId": "job-123",
  "toState": "RESOLVED",
  "reason": "Manual admin resolution due to appeal"
}
```

Response:
```json
{
  "success": true,
  "jobId": "job-123",
  "fromState": "DISPUTED",
  "toState": "RESOLVED",
  "forced": true,
  "timestamp": "2024-06-23T10:30:00Z"
}
```

**Note:** Forced transitions are logged with `forced: true` in the audit trail.

## Using the State Machine in Code

### Basic Usage

```typescript
import { stateMachine, JobState } from '../services/state-machine';

// Check if transition is valid
const canTransition = stateMachine.canTransition(JobState.IN_PROGRESS, JobState.RELEASED);
// false - must go through EVIDENCE_SUBMITTED and AI_VERIFIED first

// Get valid next states
const nextStates = stateMachine.getValidNextStates(JobState.IN_PROGRESS);
// ['EVIDENCE_SUBMITTED', 'DISPUTED', 'FAILED']

// Perform a transition
try {
  await stateMachine.transitionState({
    jobId: 'job-123',
    fromState: JobState.IN_PROGRESS,
    toState: JobState.EVIDENCE_SUBMITTED,
    userId: 'freelancer-789',
    reason: 'Freelancer uploaded completion evidence',
    metadata: {
      evidenceHash: 'sha256:abc123...',
      ipfsHash: 'QmXxxx...'
    }
  });
  console.log('Transition successful');
} catch (error) {
  console.error('Invalid transition:', error.message);
}
```

### In Payment Service

When payment is confirmed:
```typescript
// Before: Payment service just updated payment status
// Now: Payment service transitions job state

await stateMachine.transitionState({
  jobId,
  fromState: JobState.CREATED,
  toState: JobState.FUNDED,
  userId: buyerId,
  reason: 'Stripe payment succeeded',
  metadata: {
    paymentIntentId: stripePaymentIntentId,
    amount,
    currency
  }
});
```

### In Escrow Service

When escrow is held:
```typescript
// Escrow service transitions job to ACCEPTED after freelancer approves
await stateMachine.transitionState({
  jobId,
  fromState: JobState.FUNDED,
  toState: JobState.ACCEPTED,
  userId: freelancerId,
  reason: 'Freelancer accepted job',
  metadata: {
    escrowId,
    amount,
    releaseCondition: 'Evidence verification'
  }
});
```

### Getting Current State

```typescript
const currentState = await stateMachine.getJobState('job-123');
// JobState.IN_PROGRESS

if (currentState === JobState.RELEASED) {
  console.log('Job completed and payment released');
}
```

### Checking State Consistency

```typescript
const result = await stateMachine.validateStateConsistency('job-123');

if (!result.valid) {
  console.error('State consistency issues found:');
  result.issues.forEach(issue => console.error(`  - ${issue}`));
  
  // Alert monitoring system
  await alertMonitoring(result.issues);
}
```

### Getting Transition History

```typescript
const history = await stateMachine.getTransitionHistory('job-123');

for (const transition of history) {
  console.log(
    `${transition.fromState} → ${transition.toState} ` +
    `by ${transition.userId} at ${transition.createdAt}`
  );
}
```

## Database Schema

The state machine uses the following Firestore collections:

### `jobs` Collection
```typescript
{
  id: string;
  state: JobState;
  previousState?: JobState;
  jobId: string;
  buyerId: string;
  freelancerId: string;
  amount: number;
  currency: string;
  
  // State tracking
  transitionHistory: {
    [state]: Timestamp
  };
  
  lastStateChange: {
    fromState: JobState;
    toState: JobState;
    timestamp: Timestamp;
    userId: string;
    reason?: string;
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `state_transitions` Collection (Audit Log)
```typescript
{
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
```

### `domain_events` Collection
```typescript
{
  id: string;
  jobId: string;
  type: string;  // e.g., "state.in_progress.evidence_submitted"
  fromState: JobState;
  toState: JobState;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
  processed: boolean;
}
```

## Monitoring and Alerting

### Check System Health

Get consistency of all recent jobs:
```bash
# For each job, check consistency
for jobId in $(getRecentJobIds); do
  curl http://localhost:3001/api/state-machine/consistency/$jobId
done
```

### Alert on Invalid States

```typescript
// Background monitoring job
async function monitorStateConsistency() {
  const jobs = await getRecentJobs();
  
  for (const job of jobs) {
    const result = await stateMachine.validateStateConsistency(job.id);
    
    if (!result.valid) {
      await alertOps({
        severity: 'HIGH',
        message: `State consistency issues in job ${job.id}`,
        issues: result.issues
      });
    }
  }
}

// Run every 5 minutes
setInterval(monitorStateConsistency, 5 * 60 * 1000);
```

### Track Transition Failures

```typescript
// Check for failed transitions in audit log
const failedTransitions = await db
  .collection('state_transitions')
  .where('success', '==', false)
  .where('createdAt', '>=', Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60)))
  .get();

console.log(`Failed transitions in last hour: ${failedTransitions.size}`);
```

## Common Workflows

### Complete Job Successfully

```
CREATED 
  ↓ (Payment processed)
FUNDED 
  ↓ (Freelancer accepts)
ACCEPTED 
  ↓ (Work starts)
IN_PROGRESS 
  ↓ (Evidence uploaded)
EVIDENCE_SUBMITTED 
  ↓ (AI verifies)
AI_VERIFIED 
  ↓ (Release approved)
RELEASED
```

### Job with Dispute

```
CREATED 
  ↓
FUNDED 
  ↓
ACCEPTED 
  ↓
IN_PROGRESS 
  ↓ (Dispute initiated)
DISPUTED 
  ↓ (Resolved by arbitrator)
RESOLVED 
  ↓
RELEASED
```

### Job Cancelled Early

```
CREATED 
  ↓
FUNDED 
  ↓
CANCELLED (Buyer cancels before acceptance)
```

### Job Failed

```
CREATED 
  ↓
FUNDED 
  ↓
ACCEPTED 
  ↓
IN_PROGRESS 
  ↓
FAILED (Technical error - refund issued)
```

## Error Handling

### Invalid Transition Attempt
```typescript
try {
  await stateMachine.transitionState({
    jobId: 'job-123',
    fromState: JobState.CREATED,
    toState: JobState.RELEASED,  // Invalid!
    userId: 'buyer-456'
  });
} catch (error) {
  // Error: "Invalid state transition: CREATED → RELEASED"
  // Response includes validNextStates: ["FUNDED", "CANCELLED"]
}
```

### Transition with Invalid Context
```typescript
// Missing required metadata
try {
  await stateMachine.transitionState({
    jobId: 'job-123',
    fromState: JobState.IN_PROGRESS,
    toState: JobState.EVIDENCE_SUBMITTED,
    userId: 'freelancer-789',
    // Missing: evidence hash, URL, etc.
  });
} catch (error) {
  // Error: "Transition validation failed"
}
```

## Best Practices

### 1. Always Check Before Transitioning

```typescript
// BAD: Assume transition is valid
await stateMachine.transitionState(context);

// GOOD: Check first
const nextStates = stateMachine.getValidNextStates(currentState);
if (!nextStates.includes(targetState)) {
  throw new Error(`Cannot transition to ${targetState}`);
}
await stateMachine.transitionState(context);
```

### 2. Include Detailed Reason and Metadata

```typescript
// BAD: Minimal context
await stateMachine.transitionState({
  jobId,
  fromState,
  toState,
  userId
});

// GOOD: Detailed context for auditing
await stateMachine.transitionState({
  jobId,
  fromState,
  toState,
  userId,
  reason: 'Freelancer uploaded completion evidence via mobile app',
  metadata: {
    evidenceHash: 'sha256:abc123...',
    evidenceType: 'photo',
    ipfsHash: 'QmXxxx...',
    uploadedFrom: 'ios',
    timestamp: Date.now()
  }
});
```

### 3. Handle Consistency Issues

```typescript
// Before processing, validate state consistency
const consistency = await stateMachine.validateStateConsistency(jobId);
if (!consistency.valid) {
  console.warn(`State consistency issues: ${consistency.issues}`);
  
  // Decide: Skip this job, alert ops, or attempt recovery
  if (severity === 'critical') {
    await alertOpsTeam(consistency.issues);
    return;
  }
}
```

### 4. Transition in the Right Place

```typescript
// Payment Service: Transition on payment confirmation
paymentService.confirmPayment() → stateMachine.CREATED → FUNDED

// Escrow Service: Transition on escrow held
escrowService.holdEscrow() → stateMachine.FUNDED → ACCEPTED

// Evidence Service: Transition on evidence upload
evidenceService.submitEvidence() → stateMachine.IN_PROGRESS → EVIDENCE_SUBMITTED

// AI Service: Transition on verification
aiService.verifyEvidence() → stateMachine.EVIDENCE_SUBMITTED → AI_VERIFIED

// Release Service: Transition on release
releaseService.releasePayment() → stateMachine.AI_VERIFIED → RELEASED
```

## Troubleshooting

### Job Stuck in Invalid State

Check consistency:
```bash
curl http://localhost:3001/api/state-machine/consistency/job-123
```

View history to see what happened:
```bash
curl http://localhost:3001/api/state-machine/history/job-123
```

If necessary, force correct state (admin only):
```bash
curl -X POST http://localhost:3001/api/state-machine/force-transition \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job-123",
    "toState": "IN_PROGRESS",
    "reason": "Recovery from stuck state - payment was confirmed but not reflected"
  }'
```

### Audit Trail Shows Incorrect Transitions

Look for `forced: true` transitions:
```typescript
const transitions = await stateMachine.getTransitionHistory(jobId);
const forced = transitions.filter(t => t.metadata?.forced);

console.log(`Found ${forced.length} forced transitions`);
```

## Migration Guide (Adding State Machine to Existing Backend)

1. Add `JobState` enum to job document schema
2. Populate existing jobs with appropriate states based on payment/escrow status
3. Update payment service to call `stateMachine.transitionState()` when confirming payment
4. Update escrow service to call `stateMachine.transitionState()` when holding/releasing
5. Monitor state_transitions collection for any failures
6. Enable state consistency monitoring

## Performance Considerations

- **Transition validation:** O(1) lookup via Map
- **History retrieval:** O(n) where n = number of transitions
- **Consistency check:** O(m) where m = related collections (payments, escrow)
- **Domain events:** Async, non-blocking

For jobs with 100+ transitions, retrieve history with pagination.

## Security

- State transitions are immutable (recorded in audit log)
- Force transitions require admin verification (implement via middleware)
- All transitions include userId for accountability
- State consistency is validated regularly
- Domain events enable external systems to react to state changes
