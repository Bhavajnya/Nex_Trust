# MVP Testing Guide - Evidence Upload + GPS Verification

## Quick Start Testing

### Test 1: Happy Path - Complete Job Workflow

1. **Create Job** (as Customer)
   - Navigate to /dashboard/customer
   - Create new job: "Fix leaky faucet"
   - Budget: $100
   - Location: Austin, TX (30.2672° N, 97.7431° W)

2. **Fund Job**
   - Click "Fund" button
   - Job state → FUNDED

3. **Accept Job** (as Worker)
   - Switch to Worker account
   - Navigate to /dashboard/worker
   - See available job
   - Click "Accept"
   - Job state → ACCEPTED

4. **Start Work**
   - Click "Start Work"
   - Job state → IN_PROGRESS

5. **Upload Evidence**
   - Click "Submit Evidence"
   - Select file (JPG/PNG/MP4)
   - File uploads to Vercel Blob
   - Evidence status: UPLOADED
   - Job state → EVIDENCE_SUBMITTED

6. **AI Verification**
   - System queues verification
   - Evidence status: UNDER_VERIFICATION
   - (In mock mode, verification passes immediately)

7. **Payment Release**
   - Evidence status: VERIFIED
   - Job state: VERIFIED
   - Payment released to worker
   - Job state: RELEASED

**Expected Result**: Job completed, worker receives payment

### Test 2: GPS Verification

1. Upload evidence with location metadata
   - Evidence latitude: 30.2672 (Austin area)
   - Evidence longitude: -97.7431

2. System verifies:
   - Distance from job location: 0m
   - Within allowed radius (1km): YES
   - Confidence: 100%

3. Check evidence record in DB:
   - `gpsVerification.withinAllowedRadius: true`
   - `gpsVerification.distanceMeters: 0`
   - `gpsVerification.confidence: 1.0`

**Expected Result**: GPS verification passes

### Test 3: Verification Failure - Location Too Far Away

1. Upload evidence with wrong location
   - Evidence latitude: 40.7128 (New York area)
   - Evidence longitude: -74.0060

2. System verifies:
   - Distance from job location (Austin): ~2100km
   - Within allowed radius (1km): NO
   - Confidence: 0% (distance failure)

3. Evidence status: REJECTED (GPS check failed)

4. Job state: remains IN_PROGRESS (can retry)

**Expected Result**: Evidence rejected, job allows retry

### Test 4: Invalid State Transition

1. Create job (state: CREATED)

2. Try to directly transition to RELEASED (skip intermediates)

3. System rejects:
   - Error: "Invalid state transition: CREATED → RELEASED"
   - Transition not recorded in history

4. Job remains in CREATED state

**Expected Result**: Invalid transition blocked

### Test 5: Duplicate Evidence Upload

1. Upload evidence file (file hash: abc123)
   - Evidence created successfully
   - Job: EVIDENCE_SUBMITTED

2. Verification passes
   - Job: VERIFIED

3. Try to upload same file again
   - System detects duplicate (same jobId + same fileHash)
   - Error: "Duplicate evidence detected"
   - Previous evidence shown

**Expected Result**: Duplicate prevented

## What to Check in Firestore

### evidence collection
```
{
  id: "ev_xyz",
  jobId: "job_123",
  uploadedBy: "user_456",
  uploadedAt: Timestamp,
  status: "VERIFIED",  // UPLOADED → UNDER_VERIFICATION → VERIFIED
  storageUrl: "https://blob-url.vercel.app/...",
  blobPath: "evidence/timestamp-random-filename",
  fileHash: "sha256hash",
  gpsLocation: {
    latitude: 30.2672,
    longitude: -97.7431,
    accuracy: 10,
    timestamp: 1234567890
  },
  gpsVerification: {
    withinAllowedRadius: true,
    distanceMeters: 25.3,
    allowedRadiusMeters: 1000,
    confidence: 0.95,
    issues: []
  },
  aiAnalyzed: true,
  aiAnalysisResult: {
    confidence: 0.98,
    category: "plumbing_work",
    description: "Fixed faucet with clear evidence"
  },
  flaggedForFraud: false
}
```

### jobs collection
```
{
  id: "job_123",
  state: "RELEASED",  // CREATED → FUNDED → ACCEPTED → IN_PROGRESS → EVIDENCE_SUBMITTED → VERIFIED → RELEASED
  previousState: "VERIFIED",
  lastStateChange: {
    fromState: "VERIFIED",
    toState: "RELEASED",
    timestamp: Timestamp,
    userId: "customer_id",
    reason: "Payment released"
  },
  transitionHistory: {
    CREATED: Timestamp,
    FUNDED: Timestamp,
    ACCEPTED: Timestamp,
    IN_PROGRESS: Timestamp,
    EVIDENCE_SUBMITTED: Timestamp,
    VERIFIED: Timestamp,
    RELEASED: Timestamp
  }
}
```

### transaction_logs collection
```
{
  operation: "evidence_uploaded",
  status: "completed",
  jobId: "job_123",
  evidenceId: "ev_xyz",
  details: {
    fileName: "work-photo.jpg",
    fileHash: "sha256hash",
    fileSize: 2048000,
    contentType: "image/jpeg",
    storageUrl: "https://blob-url.vercel.app/...",
    blobPath: "evidence/..."
  },
  createdAt: Timestamp
}
```

## API Endpoints to Test

### Upload Evidence
```bash
curl -X POST http://localhost:3001/api/evidence/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "jobId=job_123" \
  -F "file=@photo.jpg"

# Response:
{
  "success": true,
  "evidenceId": "ev_xyz",
  "hash": "sha256hash",
  "storageUrl": "https://blob-url.vercel.app/...",
  "status": "UPLOADED"
}
```

### Get Job Evidence
```bash
curl http://localhost:3001/api/evidence/job/job_123 \
  -H "Authorization: Bearer TOKEN"

# Response:
{
  "success": true,
  "evidence": [
    { /* evidence record */ }
  ]
}
```

### Get Evidence Details
```bash
curl http://localhost:3001/api/evidence/ev_xyz \
  -H "Authorization: Bearer TOKEN"

# Response:
{
  "success": true,
  "evidence": { /* evidence record with GPS verification */ }
}
```

## Status Indicators

### Evidence Status Progression
- PENDING_UPLOAD → User selecting file
- UPLOADED → File in Vercel Blob, ready for verification
- UNDER_VERIFICATION → AI/GPS checks running
- VERIFIED → All checks passed, ready for release
- REJECTED → Failed verification, can retry

### Job State Progression
- CREATED → Job posted
- FUNDED → Payment locked in escrow
- ACCEPTED → Worker accepted
- IN_PROGRESS → Work in progress
- EVIDENCE_SUBMITTED → Evidence uploaded, awaiting verification
- VERIFIED → Evidence verified, ready to release
- RELEASED → Complete, payment transferred

## Common Issues & Fixes

**Issue**: Upload fails with "BLOB_READ_WRITE_TOKEN not set"
- Fix: Ensure Vercel Blob integration is connected in project settings

**Issue**: GPS verification fails silently
- Fix: Check job record has `latitude` and `longitude` fields

**Issue**: Evidence stays UNDER_VERIFICATION forever
- Fix: Ensure QueueManager is properly initialized and processing jobs

**Issue**: File size limit exceeded
- Fix: Keep file < 100MB, check multer configuration

**Issue**: State transition blocked
- Fix: Verify previous state is valid predecessor (check state machine rules)

## Performance Metrics

- File upload: < 5 seconds (depends on file size and connection)
- GPS verification: < 100ms
- State transition: < 500ms
- AI verification: 30-60 seconds (mock: instant)
- Total job completion: ~2-5 minutes

## Success Criteria

All tests pass when:
1. File uploads to Vercel Blob successfully
2. Evidence record created with correct status
3. Job state transitions properly
4. GPS verification calculates distance correctly
5. Payment releases after verification
6. Invalid transitions are rejected
7. Duplicate uploads detected
8. All evidence metadata properly stored

## Debugging

Enable logging:
```typescript
// In console, set debug mode
console.log('[v0] Starting file upload...');
console.log('[BlobStorage] Upload successful...');
console.log('[Evidence] Marked as VERIFIED...');
console.log('[StateMachine] Transition complete...');
```

Check Firestore collections directly for evidence records and state history.
