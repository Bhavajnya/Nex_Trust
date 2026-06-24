# State Machine Quick Reference

## Valid State Transitions

```
CREATED         → FUNDED, CANCELLED
FUNDED          → ACCEPTED, FAILED, CANCELLED
ACCEPTED        → IN_PROGRESS, FAILED, CANCELLED
IN_PROGRESS     → EVIDENCE_SUBMITTED, DISPUTED, FAILED
EVIDENCE_SUBMITTED → AI_VERIFIED, DISPUTED, FAILED
AI_VERIFIED     → RELEASED, DISPUTED, FAILED
DISPUTED        → RESOLVED
RESOLVED        → RELEASED
```

## Terminal States

These states cannot transition further:
- `RELEASED` - Job completed, payment released
- `CANCELLED` - Job cancelled, refund issued
- `FAILED` - Job failed, refund issued

## API Quick Commands

### Check valid next states
```bash
curl http://localhost:3001/api/state-machine/valid-transitions/IN_PROGRESS
# Returns: ["EVIDENCE_SUBMITTED", "DISPUTED", "FAILED"]
```

### Can this transition happen?
```bash
curl -X POST http://localhost:3001/api/state-machine/can-transition \
  -H "Content-Type: application/json" \
  -d '{"jobId": "job-123", "toState": "RELEASED"}'
# Returns: canTransition: false (if in wrong state)
```

### Perform transition
```bash
curl -X POST http://localhost:3001/api/state-machine/transition \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job-123",
    "toState": "EVIDENCE_SUBMITTED",
    "reason": "Freelancer uploaded proof"
  }'
```

### View job history
```bash
curl http://localhost:3001/api/state-machine/history/job-123
# Shows all transitions with timestamps
```

### Check state consistency
```bash
curl http://localhost:3001/api/state-machine/consistency/job-123
# Returns valid: true/false + any issues
```

## In Code

```typescript
import { stateMachine, JobState } from '../services/state-machine';

// Get valid next states
const nextStates = stateMachine.getValidNextStates(JobState.IN_PROGRESS);

// Check if transition allowed
if (stateMachine.canTransition(JobState.IN_PROGRESS, JobState.RELEASED)) {
  // This returns false
}

// Perform transition
await stateMachine.transitionState({
  jobId: 'job-123',
  fromState: JobState.IN_PROGRESS,
  toState: JobState.EVIDENCE_SUBMITTED,
  userId: 'freelancer-789',
  reason: 'Evidence uploaded',
  metadata: { hash: 'abc123...' }
});
```

## Workflow Examples

### Successful Completion
```
CREATED → FUNDED → ACCEPTED → IN_PROGRESS 
→ EVIDENCE_SUBMITTED → AI_VERIFIED → RELEASED
```

### With Dispute
```
CREATED → FUNDED → ACCEPTED → IN_PROGRESS 
→ DISPUTED → RESOLVED → RELEASED
```

### Early Cancellation
```
CREATED → FUNDED → CANCELLED
```

## Error Responses

### Invalid Transition
```json
{
  "error": "Invalid state transition: CREATED → RELEASED",
  "currentState": "CREATED",
  "validNextStates": ["FUNDED", "CANCELLED"]
}
```

### Job Not Found
```json
{
  "error": "Job not found"
}
```

## Audit Trail

Every transition is logged:
- Which state transitioned from/to
- Who initiated it and when
- Reason for transition
- Any metadata
- Success/failure status

View with: `GET /api/state-machine/history/:jobId`

## Integration Points

| Service | Triggers | Transition |
|---------|----------|-----------|
| Payment | Payment confirmed | CREATED → FUNDED |
| Escrow | Job accepted | FUNDED → ACCEPTED |
| Work | Freelancer starts | ACCEPTED → IN_PROGRESS |
| Evidence | Submission uploaded | IN_PROGRESS → EVIDENCE_SUBMITTED |
| AI | Verification passed | EVIDENCE_SUBMITTED → AI_VERIFIED |
| Release | Payment released | AI_VERIFIED → RELEASED |
| Dispute | Dispute filed | (any state) → DISPUTED |

## When Adding New Transitions

1. Update `initializeTransitionRules()` in state-machine.ts
2. Add to this reference
3. Update STATE_MACHINE_GUIDE.md
4. Update database monitoring queries
5. Test state consistency checks
