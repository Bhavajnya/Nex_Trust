# Magic Handshake MVP - Local Development Setup

**Goal**: Run the complete end-to-end job lifecycle flow locally without external dependencies.

---

## Prerequisites

- Node.js 18+
- Redis server running locally
- Firebase project configured
- Terminal with 3+ tabs for running processes

---

## Phase 1: Firebase Setup (REQUIRED)

Firebase is absolutely required. Without it, authentication and database won't work.

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project: "Magic Handshake MVP"
3. Enable Email/Password authentication
4. Create Firestore database (start in test mode)

### Step 2: Get Service Account Credentials

1. Project Settings → Service Accounts
2. Click "Generate Private Key" → Downloads JSON file
3. Open JSON file and note these values:
   ```
   - project_id
   - private_key (copy entire value with \n)
   - client_email
   - private_key_id
   - client_id
   ```

### Step 3: Get Web SDK Credentials

1. Project Settings → General tab
2. Under "Your Apps" → Web app config
3. Note these values:
   ```
   - apiKey
   - authDomain
   - projectId
   - storageBucket
   - messagingSenderId
   - appId
   ```

### Step 4: Configure Backend .env

Create/update `/backend/.env.development`:

```env
# Server
PORT=3001
NODE_ENV=development
API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000

# Firebase (from service account JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Redis (default for local dev)
REDIS_URL=redis://localhost:6379

# Stripe (mock mode for MVP - no key needed)
STRIPE_SECRET_KEY=sk_test_mock
STRIPE_WEBHOOK_SECRET=whsec_test_mock

# AI (Mock mode - no OpenAI key needed)
USE_MOCK_AI=true
OPENAI_API_KEY=sk_mock
OPENAI_MODEL=gpt-4-vision-preview

# Verification
VERIFICATION_CONFIDENCE_THRESHOLD=0.90
VERIFICATION_TIMEOUT_MS=30000
```

### Step 5: Configure Frontend .env

Create/update `/frontend/.env.development`:

```env
# API
VITE_API_URL=http://localhost:3001/api

# Firebase (from web SDK config)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Mock mode
VITE_ENABLE_MOCK_DATA=false
VITE_ENABLE_DEBUG_LOGS=true
VITE_USE_FIREBASE_EMULATOR=false

# Network
VITE_API_TIMEOUT=30000
VITE_REQUEST_RETRY_ATTEMPTS=3
VITE_REQUEST_RETRY_DELAY=1000
```

---

## Phase 2: Redis Setup (REQUIRED)

Redis is required for the verification queue.

### Option A: Docker (Recommended)

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Verify:
```bash
redis-cli ping
# Should return: PONG
```

### Option B: Local Install

**macOS**:
```bash
brew install redis
redis-server
```

**Ubuntu/Debian**:
```bash
sudo apt-get install redis-server
redis-server
```

**Windows**:
Download from [redis.io/download](https://redis.io/download)

### Verify Redis Running

```bash
redis-cli INFO
# Should show: redis_version, used_memory, connected_clients
```

---

## Phase 3: Project Setup

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Verify config is valid
npm run build

# Start dev server
npm run dev
```

Expected output:
```
[Server] Listening on port 3001
[Config] Firebase configured
[Config] Redis connected
[Queue] Verification queue initialized
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in xx ms

➜  Local:   http://localhost:5173/
```

### Verification Worker (Critical)

In a 3rd terminal:

```bash
cd backend

# Start verification worker
npm run worker:start
```

Expected output:
```
[Worker] Verification worker started
[Worker] Listening to queue: verification
[Worker] Ready to process jobs
```

---

## Phase 4: Test Complete E2E Flow

Open browser: `http://localhost:5173`

### Test Flow Step-by-Step

1. **Create Account**
   - Sign up as Customer (email: customer@example.com, password: Test123!)
   - Note your User ID in browser console: `console.log(user.uid)`

2. **Create Job**
   - Go to Dashboard (Customer)
   - Click "Create Job"
   - Fill: Title, Description, Budget ($100)
   - Click "Create"
   - Note Job ID

3. **Fund Job** (Mock)
   - Click "Fund" on new job
   - Check browser console for: `[v0] Payment initiated`
   - Job state should be: `FUNDED`

4. **Sign Out & Sign In as Worker**
   - Sign out (Customer account)
   - Sign up as Worker (email: worker@example.com, password: Test123!)

5. **Accept Job**
   - Go to Dashboard (Worker)
   - Find job by title
   - Click "Accept Job"
   - Job state should be: `ACCEPTED`

6. **Start Work**
   - Click "Start Work" on accepted job
   - Job state should be: `IN_PROGRESS`

7. **Upload Evidence** (Critical Test Point)
   - Click "Upload Evidence"
   - Select any image file (or generate one)
   - Click "Upload"
   - Check:
     - Frontend: `[v0] Upload successful`
     - Backend logs: `[Queue] Job enqueued for verification`
     - Redis: Should have 1 job in verification queue

8. **Verify Evidence Processing**
   - Check verification worker logs: `[Worker] Processing verification job`
   - AI verdict: Should show (mock AI returns "APPROVED")
   - Job state should transition: `EVIDENCE_SUBMITTED` → `VERIFIED`

9. **Confirm Payment Release**
   - Switch to Customer account (refresh)
   - Go to Dashboard
   - Check job state: Should be `RELEASED`
   - Check: "Payment released to freelancer"

10. **Check Trust Score**
    - Go to Worker profile
    - Should show trust score increase (mock returns 85)

---

## Common Issues & Fixes

### Redis Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Fix**: Start Redis
```bash
redis-server
# or with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Firebase Auth Error
```
Error: Failed to sign in. Please check your credentials.
```

**Fix**: 
1. Verify Firebase credentials in `.env.development`
2. Check Firestore Database Rules (use test mode)
3. Check Email/Password auth is enabled in Firebase Console

### Verification Queue Empty
```
[Queue] No verification jobs found
```

**Fix**:
1. Verify Redis is running: `redis-cli ping`
2. Verify worker is started: `npm run worker:start`
3. Check queue URL in logs: `[Queue] Using Redis URL: redis://localhost:6379`

### Job Stuck in EVIDENCE_SUBMITTED
```
Job never transitions to VERIFIED
```

**Fix**:
1. Check worker logs: Are jobs being processed?
2. Check Redis: `redis-cli LLEN bull:verification:active`
3. Verify OpenAI mock is enabled: `USE_MOCK_AI=true`
4. Check queue failure count: `redis-cli LLEN bull:verification:failed`

### Payment Not Released
```
Job is VERIFIED but payment not released
```

**Fix**:
1. Check payment-state-coordinator logs
2. Verify Stripe mock config: `STRIPE_SECRET_KEY=sk_test_mock`
3. Check job document in Firestore: Is escrow recorded?

---

## Verify Complete Flow Worked

After step 10 above, you should see:

- **Frontend**: All dashboards load, no auth errors
- **Backend**: All API routes respond with 200/201
- **Database**: Job document shows: `state: 'RELEASED', verified: true`
- **Queue**: Redis shows 0 active jobs (all processed)
- **Logs**: Clear workflow from upload → queue → verify → release

If all checks pass: **MVP Core Flow is Working ✓**

---

## Next Steps After MVP Works

1. Run E2E test suite: `npm test -- e2e-critical-path.test.ts`
2. Test with real Firebase/Redis on cloud
3. Add error handling improvements (non-blocking)
4. Fix route guards (non-blocking)
5. Deploy to production

---

## Quick Reference: Running Everything

**Terminal 1**: Redis
```bash
redis-server
# or: docker run -d -p 6379:6379 redis:7-alpine
```

**Terminal 2**: Backend + API
```bash
cd backend && npm run dev
```

**Terminal 3**: Verification Worker
```bash
cd backend && npm run worker:start
```

**Terminal 4**: Frontend
```bash
cd frontend && npm run dev
```

**Terminal 5**: Browser
```
Open http://localhost:5173
```

All running simultaneously = MVP Ready for Testing
