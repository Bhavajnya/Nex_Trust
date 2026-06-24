# Job Lifecycle Test Plan

## Test Cases

### 1. Happy Path: Complete Workflow
**Flow**: CREATED → FUNDED → ACCEPTED → IN_PROGRESS → EVIDENCE_SUBMITTED → VERIFIED → RELEASED

**Steps**:
1. Create job
2. Fund job (escrow locked)
3. Worker accepts job
4. Worker starts work (IN_PROGRESS)
5. Worker uploads evidence (EVIDENCE_SUBMITTED)
   - File stored in Vercel Blob
   - Evidence status: UPLOADED
6. AI verification runs
   - Evidence status: UNDER_VERIFICATION
7. Verification passes
   - Evidence status: VERIFIED
   - Job state: VERIFIED
8. Payment released
   - Job state: RELEASED
   - Escrow released to worker
   - Buyer charged

**Expected Result**: Job completed successfully, funds transferred

---

### 2. Verification Failure
**Flow**: CREATED → FUNDED → ACCEPTED → IN_PROGRESS → EVIDENCE_SUBMITTED → REJECTED

**Steps**:
1. Create and fund job
2. Accept and start work
3. Upload evidence
4. AI verification FAILS
   - Evidence status: REJECTED
   - Job remains IN_PROGRESS (not automatically failed)
5. Worker can re-upload or job can be disputed

**Expected Result**: Evidence rejected, job stays IN_PROGRESS for retry

---

### 3. Missing Evidence
**Flow**: CREATED → FUNDED → ACCEPTED → IN_PROGRESS → EVIDENCE_SUBMITTED (without actual upload)

**Steps**:
1. Create and fund job
2. Accept and start work
3. Try to mark EVIDENCE_SUBMITTED without uploading file
4. System should:
   - Require actual evidence file
   - Prevent state transition to VERIFIED without evidence
   - Enforce evidence → verification chain

**Expected Result**: Cannot proceed to RELEASED without proper evidence

---

### 4. Invalid Transition
**Flow**: Attempt CREATED → RELEASED (skip intermediates)

**Steps**:
1. Create job
2. Try to directly transition to RELEASED (no FUNDED, ACCEPTED, etc.)
3. State machine validates transition rules

**Expected Result**: Transition rejected with error message

---

### 5. Duplicate Evidence Upload
**Flow**: EVIDENCE_SUBMITTED → VERIFIED → Try uploading different evidence

**Steps**:
1. Create, fund, accept, start job
2. Upload evidence (file hash recorded)
3. Evidence verified, job state VERIFIED
4. Try to upload different evidence
5. System detects duplicate jobId + new fileHash

**Expected Result**: 
- Either prevent upload (job already verified)
- Or warn user
- Maintain evidence integrity

---

## Evidence Status Flow

All evidence uploads follow this status flow:

1. **PENDING_UPLOAD**: Initial state when upload starts
2. **UPLOADED**: File successfully stored in Vercel Blob
3. **UNDER_VERIFICATION**: AI/GPS verification in progress
4. **VERIFIED**: All verification passed, ready for release
5. **REJECTED**: Verification failed, can retry

## Critical Chain

Evidence verification must trigger entire chain:
```
uploadEvidence()
  ↓ (calls)
createEvidence(status=UPLOADED)
  ↓ (calls)
verifyEvidence(status=UNDER_VERIFICATION)
  ↓ (on success)
markAsVerified(status=VERIFIED)
  ↓ (calls)
transitionJobState(IN_PROGRESS → VERIFIED)
  ↓ (calls)
triggerPaymentRelease()
  ↓ (calls)
transitionJobState(VERIFIED → RELEASED)
```

If ANY step fails, whole chain fails and job stays in previous state.

## Implementation Checklist

- [x] Evidence Upload endpoint (POST /evidence/upload)
- [x] Vercel Blob storage integration
- [x] Evidence Status enum (PENDING_UPLOAD, UPLOADED, UNDER_VERIFICATION, VERIFIED, REJECTED)
- [x] Job state transitions (EVIDENCE_SUBMITTED, VERIFIED, RELEASED)
- [x] State machine validation
- [ ] Test Case 1: Happy path execution
- [ ] Test Case 2: Verification failure handling
- [ ] Test Case 3: Missing evidence validation
- [ ] Test Case 4: Invalid transition rejection
- [ ] Test Case 5: Duplicate upload handling
- [ ] GPS verification integration
- [ ] Payment release on VERIFIED

## Success Criteria

All test cases pass:
- Job state machine never enters invalid state
- Evidence is properly stored and linked
- Verification chain completes end-to-end
- Payment only released after verification
- Invalid transitions rejected with clear errors
