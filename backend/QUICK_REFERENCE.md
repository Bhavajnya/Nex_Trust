# Backend API Quick Reference

## Getting Started

```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
pnpm install
pnpm dev
```

## Health Check

```bash
curl http://localhost:3001/health
# { "status": "healthy", "timestamp": "..." }
```

## Payments API

### Create Payment (Idempotent)
```bash
curl -X POST http://localhost:3001/api/payments/create \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-order-id" \
  -d '{
    "jobId": "job-123",
    "buyerId": "buyer-456",
    "amount": 100.50,
    "currency": "USD",
    "metadata": {"custom": "data"}
  }'

# Response
{
  "success": true,
  "paymentId": "p-abc123",
  "stripeIntentId": "pi_xyz789",
  "idempotencyKey": "unique-order-id"
}
```

### Confirm Payment
```bash
curl -X POST http://localhost:3001/api/payments/confirm \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-confirmation-id" \
  -d '{
    "paymentId": "p-abc123",
    "stripeIntentId": "pi_xyz789"
  }'

# Response
{
  "success": true,
  "message": "Payment confirmed",
  "idempotencyKey": "unique-confirmation-id"
}
```

### Get Payment
```bash
curl http://localhost:3001/api/payments/p-abc123

# Response
{
  "success": true,
  "payment": {
    "id": "p-abc123",
    "jobId": "job-123",
    "buyerId": "buyer-456",
    "amount": 100.50,
    "currency": "USD",
    "status": "succeeded",
    "stripePaymentIntentId": "pi_xyz789",
    "createdAt": "2024-06-23T10:00:00.000Z",
    "updatedAt": "2024-06-23T10:00:05.000Z"
  }
}
```

### List Job Payments
```bash
curl http://localhost:3001/api/payments/job/job-123

# Response
{
  "success": true,
  "payments": [
    { ...payment object... }
  ]
}
```

## Escrow API

### Hold Escrow (Idempotent)
```bash
curl -X POST http://localhost:3001/api/escrow/hold \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-escrow-id" \
  -d '{
    "jobId": "job-123",
    "buyerId": "buyer-456",
    "freelancerId": "freelancer-789",
    "amount": 100.50,
    "currency": "USD",
    "paymentRecordId": "p-abc123",
    "metadata": {"custom": "data"}
  }'

# Response
{
  "success": true,
  "escrowId": "e-def456",
  "idempotencyKey": "unique-escrow-id"
}
```

### Release Escrow (to Freelancer)
```bash
curl -X POST http://localhost:3001/api/escrow/release \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-release-id" \
  -d '{
    "escrowId": "e-def456",
    "reason": "Job completed successfully"
  }'

# Response
{
  "success": true,
  "message": "Escrow released",
  "idempotencyKey": "unique-release-id"
}
```

### Refund Escrow (to Buyer)
```bash
curl -X POST http://localhost:3001/api/escrow/refund \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-refund-id" \
  -d '{
    "escrowId": "e-def456",
    "reason": "Work not completed per requirements"
  }'

# Response
{
  "success": true,
  "message": "Escrow refunded",
  "idempotencyKey": "unique-refund-id"
}
```

### Get Escrow
```bash
curl http://localhost:3001/api/escrow/e-def456

# Response
{
  "success": true,
  "escrow": {
    "id": "e-def456",
    "jobId": "job-123",
    "buyerId": "buyer-456",
    "freelancerId": "freelancer-789",
    "amount": 100.50,
    "currency": "USD",
    "status": "held",
    "paymentRecordId": "p-abc123",
    "createdAt": "2024-06-23T10:00:08.000Z",
    "updatedAt": "2024-06-23T10:00:08.000Z"
  }
}
```

### Get Job Escrow
```bash
curl http://localhost:3001/api/escrow/job/job-123

# Response
{
  "success": true,
  "escrow": { ...escrow object... }
}
```

## Reconciliation API

### System Status
```bash
curl http://localhost:3001/api/reconciliation/status

# Response
{
  "success": true,
  "status": "healthy",
  "lastRunTime": "2024-06-23T10:05:00.000Z",
  "recentStats": {
    "totalProcessed": 150,
    "totalMismatches": 3,
    "totalRecoveries": 3
  },
  "recentJobs": [
    {
      "id": "job-123",
      "startTime": "2024-06-23T10:05:00.000Z",
      "endTime": "2024-06-23T10:05:15.000Z",
      "status": "completed",
      "totalProcessed": 42,
      "totalMismatches": 2,
      "totalRecoveries": 2
    }
  ]
}
```

### Trigger Reconciliation
```bash
curl -X POST http://localhost:3001/api/reconciliation/run

# Response
{
  "success": true,
  "message": "Reconciliation job scheduled",
  "jobId": "reconcile-abc123"
}
```

### Reconcile Specific Pair
```bash
curl -X POST http://localhost:3001/api/reconciliation/reconcile-pair \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "p-abc123",
    "escrowId": "e-def456"
  }'

# Response
{
  "success": true,
  "result": {
    "isReconciled": true,
    "action": "no_action_needed"
  }
}
```

### List Reconciliation Jobs
```bash
curl "http://localhost:3001/api/reconciliation/jobs?limit=10"

# Response
{
  "success": true,
  "jobs": [
    {
      "id": "job-123",
      "status": "completed",
      "totalProcessed": 42,
      "totalMismatches": 2,
      "totalRecoveries": 2,
      "startTime": "2024-06-23T10:05:00.000Z",
      "endTime": "2024-06-23T10:05:15.000Z"
    }
  ],
  "count": 5
}
```

### Get Job Details
```bash
curl http://localhost:3001/api/reconciliation/jobs/job-123

# Response
{
  "success": true,
  "job": {
    "id": "job-123",
    "status": "completed",
    "totalProcessed": 42,
    "totalMismatches": 2,
    "totalRecoveries": 2,
    "errors": [],
    "startTime": "2024-06-23T10:05:00.000Z",
    "endTime": "2024-06-23T10:05:15.000Z"
  }
}
```

### Create Snapshot
```bash
curl -X POST http://localhost:3001/api/reconciliation/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "p-abc123",
    "escrowId": "e-def456"
  }'

# Response
{
  "success": true,
  "snapshot": {
    "paymentId": "p-abc123",
    "escrowId": "e-def456",
    "jobId": "job-123",
    "status": "synced",
    "paymentStatus": "succeeded",
    "escrowStatus": "held",
    "amount": 100.50,
    "currency": "USD",
    "lastVerifiedAt": "2024-06-23T10:00:15.000Z",
    "reconciliationAttempts": 0
  }
}
```

## Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Payment created, escrow held |
| 400 | Bad Request | Missing required fields, validation error |
| 404 | Not Found | Payment/escrow/job doesn't exist |
| 500 | Server Error | Database/Stripe/Redis failure |

## Headers

### Required
- `Content-Type: application/json` (for POST requests)

### Recommended
- `Idempotency-Key: unique-id` (for creating/confirming payments, holding/releasing escrow)

## Database Collections

```
payments/
├── id: string (auto-generated)
├── jobId: string
├── buyerId: string
├── amount: number
├── currency: string
├── status: 'pending' | 'succeeded' | 'failed' | 'refunded'
├── stripePaymentIntentId: string
├── createdAt: Timestamp
└── updatedAt: Timestamp

escrow/
├── id: string (auto-generated)
├── jobId: string
├── buyerId: string
├── freelancerId: string
├── amount: number
├── currency: string
├── status: 'held' | 'released' | 'refunded'
├── paymentRecordId: string
├── createdAt: Timestamp
└── updatedAt: Timestamp

transaction_logs/
├── id: string
├── operation: string
├── status: string
├── paymentId?: string
├── escrowId?: string
├── jobId?: string
├── details: object
├── error?: string
├── createdAt: Timestamp
└── completedAt?: Timestamp

idempotency_keys/
├── key: string (document ID)
├── requestHash: string
├── result: any
├── createdAt: Timestamp
└── expiresAt: Timestamp

payment_escrow_snapshots/
├── paymentId: string
├── escrowId: string
├── jobId: string
├── status: string
├── amount: number
├── currency: string
├── lastVerifiedAt: Timestamp
└── reconciliationAttempts: number

reconciliation_jobs/
├── id: string
├── status: 'running' | 'completed' | 'failed'
├── totalProcessed: number
├── totalMismatches: number
├── totalRecoveries: number
├── errors: array
├── startTime: Timestamp
├── endTime: Timestamp
└── metadata: object
```

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development
API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Redis
REDIS_URL=redis://localhost:6379

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxx
```

## Common Workflows

### 1. Complete Payment Flow
```
1. POST /api/payments/create → { paymentId, stripeIntentId }
2. Frontend collects card with Stripe.js
3. Stripe webhook: charge.succeeded
4. Backend: POST /api/payments/confirm (automatic)
5. Backend: POST /api/escrow/hold (automatic)
6. Result: Payment succeeded + Escrow held
```

### 2. Release After Job Completion
```
1. Smart Judge verifies work completion
2. POST /api/escrow/release
3. Result: Freelancer paid
```

### 3. Refund on Dispute
```
1. Dispute detected
2. POST /api/escrow/refund
3. Backend initiates Stripe refund
4. Result: Buyer refunded
```

### 4. Monitor System Health
```
1. GET /api/reconciliation/status
2. Check: totalRecoveries > 0 = system working
3. Check: totalMismatches ≈ 0 = all consistent
4. Set up alerts if totalMismatches > threshold
```

## Debugging

### View Server Logs
```bash
# Look for [ServiceName] prefix
grep "\[Payment\]" logs.txt        # Payment operations
grep "\[Escrow\]" logs.txt         # Escrow operations
grep "\[Reconciliation\]" logs.txt # Reconciliation jobs
grep "\[Redis\]" logs.txt          # Redis connection
grep "\[Firebase\]" logs.txt       # Firebase status
```

### Check Database (Firestore)
```javascript
// In Firestore console
db.collection('payments').where('jobId', '==', 'job-123').get()
db.collection('escrow').where('jobId', '==', 'job-123').get()
db.collection('transaction_logs').where('jobId', '==', 'job-123').orderBy('createdAt', 'desc').limit(20).get()
```

### Test with cURL
```bash
# Check health
curl -I http://localhost:3001/health

# Test payment creation
curl -X POST http://localhost:3001/api/payments/create \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{"jobId":"test-j1","buyerId":"test-b1","amount":10,"currency":"USD"}'
```

---

For more details, see `backend/IMPLEMENTATION_GUIDE.md`
