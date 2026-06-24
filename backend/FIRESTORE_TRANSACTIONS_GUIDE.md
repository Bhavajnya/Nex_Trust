# Firestore Transactions - Money Flow Consistency

## Overview

This guide explains how Firestore transactions are used to ensure money flows (payments, escrow, refunds) are always consistent. If ANY step fails, ALL steps fail. No partial states.

## Problem We Solve

### Without Transactions (Dangerous)
```
1. Create payment in DB ✓
2. Create transaction log ✓
3. Network error!
4. App retries from step 1
5. Payment created TWICE
6. System has duplicate charges and wrong escrow amounts
```

### With Transactions (Safe)
```
1. START TRANSACTION
   ├─ Create payment in DB
   ├─ Create transaction log
   └─ END TRANSACTION
   
If any step fails: ENTIRE transaction rolls back
No partial states. No duplicate writes. Perfect consistency.
```

## Critical Money Flows

All of these use Firestore transactions:

### 1. Payment Creation
```
createPaymentAtomic():
  ├─ Create payment record
  ├─ Create transaction log
  └─ All-or-nothing
```

**Why atomic?** If only payment is created but transaction log isn't, audit trail is broken.

### 2. Payment Confirmation
```
confirmPaymentAtomic():
  ├─ READ payment to verify amount
  ├─ UPDATE payment status to 'succeeded'
  ├─ CREATE confirmation log
  └─ All-or-nothing
```

**Why atomic?** Must verify payment exists and read-modify-write atomically (prevents race conditions).

### 3. Escrow Creation
```
createEscrowAtomic():
  ├─ READ payment to verify succeeded status
  ├─ CREATE escrow record
  ├─ UPDATE payment with escrow link
  ├─ CREATE transaction log
  └─ All-or-nothing
```

**Why atomic?** Must link escrow to payment in same transaction. If escrow created but payment link missing, system is confused.

### 4. Escrow Release
```
releaseEscrowAtomic():
  ├─ READ escrow to verify 'held' status
  ├─ UPDATE escrow status to 'released'
  ├─ CREATE release log
  └─ All-or-nothing
```

**Why atomic?** Must verify status before releasing, and log the release atomically.

### 5. Escrow Refund
```
refundEscrowAtomic():
  ├─ READ escrow to verify 'held' status
  ├─ UPDATE escrow status to 'refunded'
  ├─ CREATE refund log
  └─ All-or-nothing
```

**Why atomic?** Ensures we never refund twice or refund from wrong status.

### 6. Payment Status Update
```
updatePaymentStatusAtomic():
  ├─ READ payment
  ├─ VALIDATE transition (e.g., can't go pending→cancelled)
  ├─ UPDATE payment status
  ├─ CREATE status change log
  └─ All-or-nothing
```

**Why atomic?** Enforces valid state transitions atomically.

### 7. Reconciliation Fix
```
reconcilePaymentEscrowAtomic():
  ├─ READ payment
  ├─ READ escrow
  ├─ VERIFY amounts match
  ├─ FIX escrow status if needed
  ├─ CREATE reconciliation log
  └─ All-or-nothing
```

**Why atomic?** Fixes inconsistencies atomically, ensuring no partial fixes.

## How Firestore Transactions Work

### Basic Pattern
```typescript
await db.runTransaction(async (transaction) => {
  // 1. READ
  const docRef = db.collection('...').doc('...');
  const doc = await transaction.get(docRef);
  const data = doc.data();
  
  // 2. VERIFY (business logic)
  if (data.status !== 'expected') {
    throw new Error('Invalid state');
  }
  
  // 3. MODIFY (multiple writes if needed)
  transaction.update(docRef, { status: 'new' });
  transaction.set(otherRef, otherData);
  
  // 4. COMMIT (automatic on return, or on error: automatic rollback)
  return result;
});
```

### Key Guarantees
- **All-or-nothing**: All writes succeed or all fail
- **No partial states**: System never sees intermediate states
- **Isolation**: Concurrent transactions don't interfere
- **Consistency**: Database is always in valid state

### Limitations to Know
- Max 25 document reads/writes per transaction
- Max 10 seconds per transaction
- Can't do external API calls inside transaction (e.g., Stripe)

**Workaround**: Call Stripe first, THEN do atomic Firestore transaction

## Implementation Pattern in Magic Handshake

### Stripe + Firestore Pattern
```typescript
// 1. Call external API FIRST (outside transaction)
const paymentIntent = await stripe.paymentIntents.create(...);

// 2. THEN atomic Firestore transaction
await db.runTransaction(async (transaction) => {
  // Create payment and log atomically
  transaction.set(paymentRef, { stripeId: paymentIntent.id, ... });
  transaction.set(logRef, { ... });
});
```

## Testing Transactions

### Test Success Path
```typescript
it('should create payment and log atomically', async () => {
  const result = await service.createPaymentAtomic({...});
  
  // Verify both exist
  const payment = await db.collection('payments').doc(result.paymentId).get();
  const log = await db.collection('transaction_logs').doc(result.txLogId).get();
  
  expect(payment.exists).toBe(true);
  expect(log.exists).toBe(true);
});
```

### Test Failure Path
```typescript
it('should rollback if verification fails', async () => {
  // Setup: missing payment
  
  const result = await service.createEscrowAtomic({
    paymentRecordId: 'nonexistent',
    ...
  });
  
  // Verify escrow was NOT created
  const escrow = await db.collection('escrow').doc(result.escrowId).get();
  expect(escrow.exists).toBe(false); // NOT created because transaction failed
});
```

## Performance Considerations

### Transaction Latency
- Single read: ~2-5ms
- Transaction commit: ~10-20ms
- Total per transaction: ~20-50ms

### Optimization Strategies
1. **Minimize reads** - Read only what you need
2. **Minimize writes** - Combine updates when possible
3. **Avoid hot documents** - Each document has concurrent write limit

### Scaling
- Firestore handles ~10,000 transactions/sec per database
- Money flow transactions typically <100/sec

## Monitoring Transactions

### What to Monitor
1. **Transaction rollbacks** - Should be ~0 unless logic bugs
2. **Transaction latency** - Should be <100ms
3. **Concurrent modifications** - Check for contention

### Alerting Rules
```
Alert if:
- Rollback rate > 1% of transactions
- P99 latency > 200ms
- Any amount-related inconsistency detected
```

## Common Mistakes to Avoid

### ❌ Don't: Call external APIs inside transaction
```typescript
// WRONG - Stripe call inside transaction
await db.runTransaction(async (tx) => {
  const intent = await stripe.paymentIntents.create(...); // NO!
  tx.set(...);
});
```

### ✅ Do: Call external APIs before transaction
```typescript
// CORRECT - Stripe first, then transaction
const intent = await stripe.paymentIntents.create(...);
await db.runTransaction(async (tx) => {
  tx.set(paymentRef, { stripeId: intent.id });
});
```

### ❌ Don't: Multi-step updates without transaction
```typescript
// WRONG - separate writes can fail mid-way
await db.collection('payments').doc(id).update({ status: 'confirmed' });
await db.collection('logs').doc(id).set({ ... }); // Can fail here!
```

### ✅ Do: Atomic multi-step updates
```typescript
// CORRECT - atomic
await db.runTransaction(async (tx) => {
  tx.update(paymentRef, { status: 'confirmed' });
  tx.set(logRef, { ... });
});
```

### ❌ Don't: Forget to verify preconditions
```typescript
// WRONG - what if escrow already released?
await db.runTransaction(async (tx) => {
  tx.update(escrowRef, { status: 'released' });
});
```

### ✅ Do: Read and verify first
```typescript
// CORRECT - verify state before modifying
await db.runTransaction(async (tx) => {
  const escrow = await tx.get(escrowRef);
  if (escrow.data().status !== 'held') {
    throw new Error('Can only release held escrow');
  }
  tx.update(escrowRef, { status: 'released' });
});
```

## TransactionManager API

The `TransactionManager` class provides high-level atomic operations for all money flows:

```typescript
// Create payment atomically
const { paymentId } = await transactionManager.createPaymentAtomic({
  jobId: string,
  buyerId: string,
  amount: number,
  currency: string,
  stripePaymentIntentId: string,
  idempotencyKey: string,
  metadata?: Record<string, unknown>
});

// Confirm payment atomically
await transactionManager.confirmPaymentAtomic({
  paymentId: string,
  stripeIntentId: string
});

// Create escrow atomically
const { escrowId } = await transactionManager.createEscrowAtomic({
  jobId: string,
  buyerId: string,
  freelancerId: string,
  amount: number,
  currency: string,
  paymentRecordId: string,
  idempotencyKey: string,
  metadata?: Record<string, unknown>
});

// Release escrow atomically
await transactionManager.releaseEscrowAtomic({
  escrowId: string,
  reason?: string
});

// Refund escrow atomically
await transactionManager.refundEscrowAtomic({
  escrowId: string,
  reason?: string
});

// Update payment status atomically
await transactionManager.updatePaymentStatusAtomic({
  paymentId: string,
  newStatus: 'pending' | 'succeeded' | 'failed' | 'cancelled',
  stripeDetails?: Record<string, unknown>
});

// Reconcile payment-escrow pair atomically
const result = await transactionManager.reconcilePaymentEscrowAtomic({
  paymentId: string,
  escrowId: string,
  expectedStatus: 'synced' | 'payment_pending' | 'escrow_pending' | 'mismatched'
});
```

## Database Schema for Transactions

### payments collection
```typescript
{
  id: string;
  jobId: string;
  buyerId: string;
  amount: number;
  currency: string;
  stripePaymentIntentId: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  escrowId?: string;           // Link to escrow (created atomically)
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### escrow collection
```typescript
{
  id: string;
  jobId: string;
  buyerId: string;
  freelancerId: string;
  amount: number;
  currency: string;
  status: 'held' | 'released' | 'refunded';
  paymentRecordId: string;     // Link to payment
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### transaction_logs collection (audit trail)
```typescript
{
  id: string;
  operation: 'payment_created' | 'payment_confirmed' | 'escrow_created' | 'release' | 'refund' | 'reconciliation' | 'state_transition';
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

## Guarantees Provided by TransactionManager

### 1. Consistency
- Payment and escrow amounts always match
- Payment-escrow link always exists if both exist
- Transaction log always created for every operation
- No orphaned records

### 2. Atomicity
- All writes in transaction succeed or all fail
- No partial states
- Impossible to have payment without log

### 3. Isolation
- Concurrent transactions don't interfere
- Each read-verify-write is atomic
- No race conditions

### 4. Durability
- Once committed, permanent
- Firestore automatic backups
- Complete audit trail

## Next: State Machine Integration

Once transactions are rock-solid for money flows, we integrate the state machine to also validate job state transitions atomically (coming in Sprint 1 part 2).

This ensures:
- Money flows are atomic (Firestore transactions) ✓
- Job state changes are validated (state machine) - next
- Access control enforced (RBAC middleware) - then
