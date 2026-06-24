# Magic Handshake MVP - Troubleshooting Guide

## Most Common Issues & Solutions

---

## Issue 1: "Evidence uploaded but verification never starts"

**Symptom**:
- Upload succeeds (message shows "Evidence uploaded successfully")
- Job state stays: `EVIDENCE_SUBMITTED`
- No verification happens

### Root Causes & Fixes

#### Cause 1: Redis Not Running
```bash
# Check
redis-cli ping
# If error: "Connection refused"

# Fix
redis-server
# or
docker run -d -p 6379:6379 redis:7-alpine

# Verify
redis-cli INFO
```

#### Cause 2: Verification Worker Not Started
```bash
# Check - is worker process running?
ps aux | grep "worker"

# Fix - start worker in separate terminal
cd backend
npm run worker:start

# Expected output
[Worker] Verification worker started
[Worker] Listening to queue: verification
[Worker] Ready to process jobs
```

#### Cause 3: Queue Enqueue Failed
```bash
# Check backend logs for
[Queue] Failed to enqueue verification job

# Debug - check Redis connection
cd backend
npm run debug:queue

# Check queue depth
redis-cli LLEN bull:verification:waiting
redis-cli LLEN bull:verification:active

# Fix - restart backend
npm run dev
```

#### Cause 4: REDIS_URL Configuration Wrong
```bash
# Check .env.development
REDIS_URL=redis://localhost:6379

# If using Docker with different host
REDIS_URL=redis://redis-container:6379

# If port forwarded
REDIS_URL=redis://127.0.0.1:6380
```

**Test**:
1. Upload evidence
2. Check backend logs for: `[Queue] Job enqueued`
3. Check worker logs for: `[Worker] Processing job`
4. Job should transition to VERIFIED within 5 seconds

---

## Issue 2: "Authentication fails or 401 errors"

**Symptom**:
- Login page shows but auth fails
- API calls return 401
- Firestore permission errors

### Root Causes & Fixes

#### Cause 1: Firebase Credentials Wrong
```bash
# Check .env values match Firebase Console exactly
FIREBASE_PROJECT_ID=my-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@my-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Private key MUST:
# - Start with -----BEGIN PRIVATE KEY-----
# - End with -----END PRIVATE KEY-----
# - Have \n between lines (not actual newlines)

# Fix
# 1. Download new service account JSON from Firebase
# 2. Copy values exactly, no extra spaces
# 3. For PRIVATE_KEY: Copy entire value with \n
```

#### Cause 2: Firestore Rules Too Restrictive
```bash
# Check Firebase Console → Firestore → Rules
# Should be (for MVP development)

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow all reads/writes in development
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

#### Cause 3: Email/Password Auth Not Enabled
```bash
# Check Firebase Console
# Authentication → Sign-in method
# Should have "Email/Password" enabled

# If not:
# 1. Go to Authentication
# 2. Click "Sign-in method"
# 3. Click "Email/Password"
# 4. Enable it
```

**Test**:
1. Go to login page
2. Try signup with test email
3. Should redirect to dashboard
4. No 401 or auth errors

---

## Issue 3: "Verification never completes, stuck on AI analysis"

**Symptom**:
- Worker logs show: `[Worker] Running AI verification`
- But never shows result
- Verification times out

### Root Causes & Fixes

#### Cause 1: OpenAI Key Invalid (if not using mock)
```bash
# Check .env
USE_MOCK_AI=true  # This is correct for MVP

# If using real AI
USE_MOCK_AI=false
OPENAI_API_KEY=sk_...  # Must be valid key
```

#### Cause 2: Mock AI Not Enabled
```bash
# Frontend logs show trying real OpenAI
# But no API key configured

# Fix - enable mock
# .env.development
USE_MOCK_AI=true
OPENAI_API_KEY=sk_mock
```

#### Cause 3: Verification Timeout Too Short
```bash
# Check .env
VERIFICATION_TIMEOUT_MS=30000  # 30 seconds

# If consistently timing out, increase to
VERIFICATION_TIMEOUT_MS=60000  # 60 seconds
```

#### Cause 4: Worker Process Crashed
```bash
# Check worker logs for errors
# Common: Out of memory, uncaught exceptions

# Fix
# 1. Stop worker (Ctrl+C)
# 2. Check error in logs
# 3. Restart: npm run worker:start
```

**Test**:
1. Upload evidence
2. Check worker logs: should show verdict within 2-5 seconds
3. Job should transition to VERIFIED

---

## Issue 4: "Payment not released even after verification"

**Symptom**:
- Job shows VERIFIED
- But state doesn't go to RELEASED
- Payment stuck in escrow

### Root Causes & Fixes

#### Cause 1: Payment Coordinator Not Called
```bash
# Check backend logs for
[PaymentCoordinator] Releasing payment for job

# If missing, check verification-worker.ts
# After successful verification, should call:
await paymentCoordinator.releasePaymentWithStateTransition(jobId)

# Fix - restart backend
npm run dev
```

#### Cause 2: Stripe Configuration Wrong
```bash
# Check .env
STRIPE_SECRET_KEY=sk_test_mock  # This is correct for MVP
STRIPE_WEBHOOK_SECRET=whsec_test_mock

# If using real Stripe (production)
STRIPE_SECRET_KEY=sk_test_...  # Real test key
STRIPE_WEBHOOK_SECRET=whsec_...  # Real webhook secret
```

#### Cause 3: Escrow Record Missing
```bash
# Check Firestore: jobs/{jobId}
# Should have field: escrowRecordId

# If missing:
# 1. Job wasn't properly funded
# 2. Payment coordinator can't release what doesn't exist

# Fix - ensure job was funded before worker uploads evidence
```

#### Cause 4: State Machine Guard Prevents Release
```bash
# Check state-machine-guards.ts
# Release payment only allowed from VERIFIED state

# Debug:
# 1. Check job state: is it VERIFIED?
# 2. Check payment history: any failed attempts?
# 3. Check logs for state transition errors
```

**Test**:
1. Verify job reaches VERIFIED state
2. Check Firestore: payments collection
3. New payment record should exist with status: RELEASED
4. Job state should be: RELEASED

---

## Issue 5: "Frontend can't connect to backend API"

**Symptom**:
- Frontend shows: "Failed to load jobs"
- Network tab shows CORS errors
- API calls return 0 or timeout

### Root Causes & Fixes

#### Cause 1: Backend Not Running
```bash
# Check if backend listening
lsof -i :3001
# If nothing shown, backend not running

# Fix
cd backend
npm run dev
```

#### Cause 2: Frontend API URL Wrong
```bash
# Check frontend .env
VITE_API_URL=http://localhost:3001/api

# Must match backend:
# Backend listens on http://localhost:3001
# API routes mounted at /api
```

#### Cause 3: CORS Not Configured
```bash
# Check backend server.ts
# Should have:
cors({
  origin: 'http://localhost:5173'
})

# And .env should have:
CORS_ORIGIN=http://localhost:5173
```

#### Cause 4: Frontend Running on Wrong Port
```bash
# Check frontend port
npm run dev
# Shows: ➜  Local:   http://localhost:5173/

# If running on different port (e.g., 5174)
# Update backend .env
CORS_ORIGIN=http://localhost:5174
```

**Test**:
1. Frontend loads without connection errors
2. Dashboard shows job list (or empty state)
3. Network tab shows /api/ requests getting 200
4. No CORS errors in console

---

## Issue 6: "Jobs API returns empty even though jobs exist"

**Symptom**:
- Frontend shows: "No jobs found"
- But Firestore has job documents

### Root Causes & Fixes

#### Cause 1: Query Filtering Wrong Role
```bash
# Frontend calls: api.listJobs({ role: 'customer' })
# But user is worker

# Frontend should:
# 1. Check user's role from profile
# 2. Pass correct role to query
# 3. Backend filters by buyerId/workerId

# Debug
console.log('User role:', user.profile?.role)
console.log('Query role:', roleParameter)
```

#### Cause 2: User ID Mismatch
```bash
# Backend filters by req.user.uid
# Frontend user.uid must match

# Debug in browser console
console.log('User UID:', user.uid)

# Check Firestore: jobs/{id}
# buyerId or workerId must match user.uid
```

#### Cause 3: Firestore Query Missing Index
```bash
# Error in console: "Missing index for query"

# Fix:
# 1. Check backend logs for index error
# 2. Click link in Firebase error
# 3. Create suggested composite index
# 4. Wait 1-2 minutes for index
# 5. Retry query
```

**Test**:
1. Create job as customer
2. Switch to different user (worker)
3. Should see job in "Available Jobs"
4. Accept job, should appear in "My Jobs"

---

## Quick Diagnostic Commands

### Check Redis
```bash
redis-cli ping
redis-cli INFO
redis-cli LLEN bull:verification:waiting
redis-cli LLEN bull:verification:active
```

### Check Backend
```bash
# Is it running?
lsof -i :3001

# Check logs
tail -f backend/logs/app.log

# Test API
curl http://localhost:3001/health
```

### Check Frontend
```bash
# Is it running?
lsof -i :5173

# Check browser console for errors
# F12 → Console tab

# Check network requests
# F12 → Network tab
```

### Check Firebase
```bash
# Test auth
firebase auth:list-users --project=your-project-id

# Check Firestore data
firebase firestore:export ./backup --project=your-project-id
```

---

## If Everything Fails

1. **Restart everything from scratch**:
   ```bash
   # Kill all processes
   pkill -f "node"
   pkill -f "npm"
   pkill -f "redis-server"
   
   # Clear state
   redis-cli FLUSHDB
   
   # Restart each service
   ```

2. **Check environment variables**:
   ```bash
   # Backend
   cat backend/.env.development | grep -v "^#"
   
   # Frontend
   cat frontend/.env.development | grep -v "^#"
   ```

3. **Verify Firebase connection**:
   ```bash
   # In backend project
   npm run test:firebase  # If available
   
   # Or check manually in browser console
   console.log(firebase.initializeApp)
   ```

4. **Check logs**:
   ```bash
   # Backend stdout
   grep -i "error\|warn" backend-output.log
   
   # Browser console
   # F12 → Console → Look for red errors
   ```

---

## Still Stuck?

**Check these in order**:
1. Redis running? `redis-cli ping` → PONG
2. Backend running? `curl http://localhost:3001/health`
3. Worker running? Check terminal for `[Worker] Verification worker started`
4. Firebase credentials correct? `npm run test:firebase`
5. Frontend connecting? Browser console → check /api calls

**If still stuck**: Review the complete flow in `MANUAL_E2E_TEST.md` and follow each step with console logs visible.
