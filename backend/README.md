# Magic Handshake Backend - Priority 1: Payment ↔ Escrow Consistency

## Overview

This backend implements **Priority 1** of the Magic Handshake product roadmap: ensuring robust, idempotent payment-to-escrow consistency with automatic reconciliation and recovery capabilities.

## Architecture

### Core Components

#### 1. **Idempotency Service** (`services/idempotency.ts`)
- Prevents duplicate request processing using deterministic request hashing
- Caches results for 24 hours with automatic expiration
- Detects request tampering through hash verification
- Cleanup worker removes expired keys hourly

#### 2. **Payment Service** (`services/payment.ts`)
- Creates Stripe PaymentIntents with idempotency keys
- Logs all payment operations to transaction log
- Confirms payments after successful Stripe charges
- Provides atomic batch writes to Firestore

#### 3. **Escrow Service** (`services/escrow.ts`)
- Holds funds in escrow with strict status management
- Supports release to freelancer and refund to buyer
- Maintains escrow state synchronously with payments
- All operations are idempotent

#### 4. **Reconciliation Service** (`services/reconciliation.ts`)
- Creates payment-escrow snapshots for verification
- Reconciles individual payment-escrow pairs
- Automatically fixes common mismatches
- Runs full reconciliation jobs on schedule

### Workers (Background Processing with BullMQ)

#### 1. **Reconciliation Worker** (`workers/reconciliation-worker.ts`)
- Runs every 5 minutes (configurable)
- Processes up to 100 payment-escrow mismatches per run
- Recovers from transient failures
- Logs detailed metrics and errors

#### 2. **Idempotency Cleanup Worker** (`workers/idempotency-cleanup-worker.ts`)
- Runs every hour
- Removes expired idempotency keys from Firestore
- Prevents database bloat

## Key Features

### 1. Idempotency Guarantees
```typescript
// Same request = same result, even if called multiple times
const result = await paymentService.createPayment({
  jobId: 'job-123',
  buyerId: 'buyer-456',
  amount: 100,
  currency: 'USD',
  idempotencyKey: 'unique-request-id-789'
});
```

### 2. Transaction Logging
Every operation creates an immutable log entry:
- `payment_created` → `payment_confirmed`
- `escrow_created` → `escrow_held`
- `release` or `refund` with timestamps

### 3. Automatic Reconciliation
Catches and fixes:
- Payment succeeded but escrow not held
- Stripe status out of sync with Firestore
- Amount/currency mismatches
- Failed database writes

### 4. End-to-End Consistency
- Payments and escrow are created in atomic transactions
- Reconciliation runs continuously
- Manual reconciliation API for specific pairs
- Status dashboard showing system health

## API Endpoints

### Payments

**Create Payment**
```
POST /api/payments/create
Headers: Idempotency-Key: unique-key-xxx
Body: {
  jobId: string
  buyerId: string
  amount: number
  currency: string
  metadata?: object
}
```

**Confirm Payment**
```
POST /api/payments/confirm
Headers: Idempotency-Key: unique-key-xxx
Body: {
  paymentId: string
  stripeIntentId: string
}
```

**Get Payment**
```
GET /api/payments/:paymentId
```

**List Job Payments**
```
GET /api/payments/job/:jobId
```

### Escrow

**Hold Escrow**
```
POST /api/escrow/hold
Headers: Idempotency-Key: unique-key-xxx
Body: {
  jobId: string
  buyerId: string
  freelancerId: string
  amount: number
  currency: string
  paymentRecordId: string
  metadata?: object
}
```

**Release Escrow**
```
POST /api/escrow/release
Headers: Idempotency-Key: unique-key-xxx
Body: {
  escrowId: string
  reason?: string
}
```

**Refund Escrow**
```
POST /api/escrow/refund
Headers: Idempotency-Key: unique-key-xxx
Body: {
  escrowId: string
  reason?: string
}
```

**Get Escrow**
```
GET /api/escrow/:escrowId
```

**Get Job Escrow**
```
GET /api/escrow/job/:jobId
```

### Reconciliation

**Trigger Reconciliation Job**
```
POST /api/reconciliation/run
```

**Reconcile Specific Pair**
```
POST /api/reconciliation/reconcile-pair
Body: {
  paymentId: string
  escrowId: string
}
```

**Get Reconciliation Jobs**
```
GET /api/reconciliation/jobs?limit=10
```

**Get Reconciliation Status**
```
GET /api/reconciliation/status
```

## Database Schema

### Collections

#### `payments`
```typescript
{
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
```

#### `escrow`
```typescript
{
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
```

#### `idempotency_keys`
```typescript
{
  key: string;
  requestHash: string;
  result: unknown;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}
```

#### `transaction_logs`
```typescript
{
  id: string;
  operation: 'payment_created' | 'escrow_created' | 'payment_confirmed' | ... ;
  status: 'initiated' | 'processing' | 'completed' | 'failed' | 'rolled_back';
  paymentId?: string;
  escrowId?: string;
  jobId?: string;
  details: Record<string, unknown>;
  error?: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
```

#### `payment_escrow_snapshots`
```typescript
{
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
```

#### `reconciliation_jobs`
```typescript
{
  id: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  status: 'running' | 'completed' | 'failed';
  totalProcessed: number;
  totalMismatches: number;
  totalRecoveries: number;
  errors: Array<{...}>;
  metadata: Record<string, unknown>;
}
```

## Setup Instructions

### 1. Prerequisites
- Node.js 18+
- Firebase project with Firestore
- Stripe account
- Redis instance (local or cloud)

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

### 3. Install Dependencies
```bash
pnpm install
# or in the backend directory
cd backend && pnpm install
```

### 4. Running the Backend

**Development**
```bash
pnpm run dev
# or
cd backend && pnpm run dev
```

**Production**
```bash
pnpm run build
pnpm start
# or
cd backend && pnpm run build && pnpm start
```

### 5. Verify Setup
```bash
curl http://localhost:3001/health
# Should return: { "status": "healthy", "timestamp": "..." }
```

## Monitoring & Debugging

### Check Reconciliation Status
```bash
curl http://localhost:3001/api/reconciliation/status
```

### Trigger Manual Reconciliation
```bash
curl -X POST http://localhost:3001/api/reconciliation/run
```

### View Recent Jobs
```bash
curl http://localhost:3001/api/reconciliation/jobs?limit=5
```

### Check Server Logs
All operations log with `[ServiceName]` prefix:
- `[Payment]` - Payment operations
- `[Escrow]` - Escrow operations
- `[Reconciliation]` - Reconciliation jobs
- `[ReconciliationWorker]` - Background worker
- `[Idempotency]` - Idempotency cache

## Next Steps (Priority 2-4)

### Priority 2: Structured AI Verification
- Implement JSON schema validation for AI outputs
- Replace free-form text with deterministic payouts

### Priority 3: Rule-Based Smart Judge
- Add evidence scoring system
- Implement fraud detection logic
- Combine rules + AI for payout decisions

### Priority 4: Background Job Processing
- Integrate existing workers into existing flow
- Add more job types (evidence analysis, blockchain actions)
- Setup monitoring and alerts

## Error Handling

All errors return structured JSON:
```json
{
  "error": "Descriptive error type",
  "message": "Detailed error message",
  "details": {} // Optional validation details
}
```

### Common Errors

**400 Bad Request**
- Invalid input validation (use Zod schemas)

**404 Not Found**
- Payment, escrow, or job not found

**500 Internal Server Error**
- Service or database error
- Check logs for details

## Security Considerations

1. **Idempotency Key Validation**: Request hash prevents tampering
2. **Transaction Logging**: All operations are auditable
3. **Firestore Rules**: Implement RLS per user/role
4. **Stripe Webhook Verification**: Always verify signatures
5. **Rate Limiting**: Consider adding rate limits to API endpoints
6. **Audit Logs**: Transaction logs are immutable by design

## Performance Notes

- Reconciliation runs every 5 minutes, processes up to 100 pairs per run
- Idempotency keys cached in Firestore with 24-hour TTL
- Transaction logs can be archived after 90 days
- Consider indexing by `jobId` and status fields

## Support

For issues or questions:
1. Check server logs with `[v0]` prefix
2. Review Firestore data consistency
3. Verify Stripe and Redis connections
4. Check reconciliation job status

---

**Magic Handshake Backend v1.0** - Production-ready payment-to-escrow consistency layer
