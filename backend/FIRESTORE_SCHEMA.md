# Magic Handshake - Firestore Database Schema

## Overview

This document defines all Firestore collections and their schema for Magic Handshake MVP.

**Collections**: 10  
**Total Documents**: Dynamic (depends on users and jobs)

---

## Collections

### 1. `users`
User profiles and account information.

**Document ID**: Firebase UID

```typescript
{
  id: string;                    // Duplicate of document ID
  uid: string;                   // Firebase UID
  email: string;                 // Unique email
  name: string;                  // User's full name
  role: "customer" | "worker";   // Account type
  phone?: string;                // Phone number
  bio?: string;                  // User bio (max 500 chars)
  skills?: string[];             // Skills for workers
  profileImage?: string;         // URL to profile image
  
  // Stats
  trustScore: number;            // 0-100 trust score
  jobsCompleted: number;         // Jobs finished
  jobsAccepted: number;          // Jobs accepted
  totalEarnings: number;         // Total money earned
  
  // Account status
  accountStatus: "active" | "suspended" | "deleted";
  emailVerified: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes**:
- `role` (for filtering workers/customers)
- `trustScore` (for leaderboards)
- `createdAt` (for sorting)

**Example**:
```json
{
  "id": "user_123",
  "uid": "user_123",
  "email": "john@example.com",
  "name": "John Doe",
  "role": "worker",
  "phone": "+1234567890",
  "skills": ["React", "TypeScript"],
  "trustScore": 85,
  "jobsCompleted": 42,
  "jobsAccepted": 50,
  "totalEarnings": 12500,
  "accountStatus": "active",
  "emailVerified": true,
  "createdAt": "2024-06-23T10:00:00Z",
  "updatedAt": "2024-06-23T14:00:00Z"
}
```

---

### 2. `jobs`
Job postings and tracking.

**Document ID**: UUID (random)

```typescript
{
  id: string;                           // Document ID (UUID)
  jobId: string;                        // Same as ID (for reference)
  
  // People
  buyerId: string;                      // Customer user ID
  workerId?: string;                    // Assigned worker ID
  
  // Content
  title: string;                        // Job title
  description: string;                  // Job description
  requiredSkills?: string[];            // Skills needed
  
  // Money
  budget: number;                       // Job amount
  currency: string;                     // "USD", "EUR", etc.
  
  // Status
  state: JobState;                      // CREATED, FUNDED, IN_PROGRESS, etc.
  status: string;                       // "active", "accepted", "completed", etc.
  
  // Verification
  verificationStatus: "pending" | "approved" | "rejected";
  
  // Dates
  deadline?: Timestamp;                 // Job deadline
  acceptedAt?: Timestamp;               // When worker accepted
  startedAt?: Timestamp;                // When work started
  completedAt?: Timestamp;              // When work completed
  cancelledAt?: Timestamp;              // When cancelled
  
  // References
  paymentRecordId?: string;             // Link to payments collection
  escrowRecordId?: string;              // Link to escrow collection
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes**:
- `buyerId, state` (customer's jobs by state)
- `workerId, state` (worker's jobs by state)
- `state` (filter by state)
- `createdAt` (sort by date)

**Example**:
```json
{
  "id": "job_abc123",
  "jobId": "job_abc123",
  "buyerId": "customer_1",
  "workerId": "worker_2",
  "title": "Fix website bug",
  "description": "Login page not working on mobile",
  "budget": 500,
  "currency": "USD",
  "state": "IN_PROGRESS",
  "status": "in_progress",
  "verificationStatus": "pending",
  "acceptedAt": "2024-06-23T11:00:00Z",
  "startedAt": "2024-06-23T12:00:00Z",
  "createdAt": "2024-06-23T10:00:00Z",
  "updatedAt": "2024-06-23T14:00:00Z"
}
```

**Job States**:
```
CREATED          → Initial state, not funded yet
FUNDED           → Buyer funded, ready for work
IN_PROGRESS      → Worker started work
EVIDENCE_SUBMITTED → Worker uploaded evidence
VERIFIED         → AI verification passed
RELEASED         → Payment released to worker (FINAL)
DISPUTED         → Dispute initiated
CANCELLED        → Job cancelled (FINAL)
REFUNDED         → Funds refunded to buyer (FINAL)
```

---

### 3. `evidence`
Work evidence uploads (photos/screenshots with GPS).

**Document ID**: UUID (random)

```typescript
{
  id: string;                           // Document ID (UUID)
  jobId: string;                        // Related job ID
  uploadedBy: string;                   // Worker user ID
  
  // Image data
  imageUrl: string;                     // URL in Vercel Blob or Firebase Storage
  imageHash?: string;                   // Hash for fraud detection
  
  // Location data
  latitude: number;                     // GPS latitude
  longitude: number;                    // GPS longitude
  accuracy?: number;                    // GPS accuracy in meters
  
  // Verification
  verificationStatus: "pending" | "approved" | "rejected";
  aiVerificationScore?: number;         // 0-100 confidence
  aiAnalysis?: string;                  // AI's detailed analysis
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  timestamp: Timestamp;                 // When evidence was captured
  createdAt: Timestamp;                 // When uploaded to system
}
```

**Indexes**:
- `jobId, createdAt` (get evidence for job)
- `verificationStatus` (pending verifications)

**Example**:
```json
{
  "id": "evidence_xyz789",
  "jobId": "job_abc123",
  "uploadedBy": "worker_2",
  "imageUrl": "https://blob.vercel-storage.com/evidence-abc123.jpg",
  "imageHash": "sha256_hash_here",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "accuracy": 8.5,
  "verificationStatus": "approved",
  "aiVerificationScore": 95,
  "aiAnalysis": "Work quality meets requirements",
  "timestamp": "2024-06-23T13:30:00Z",
  "createdAt": "2024-06-23T13:45:00Z"
}
```

---

### 4. `disputes`
Job disputes when quality/completion issues arise.

**Document ID**: UUID (random)

```typescript
{
  id: string;                           // Document ID (UUID)
  jobId: string;                        // Related job ID
  
  // Participants
  initiatorId: string;                  // Who started dispute (buyer or worker)
  buyerId: string;                      // Customer
  workerId: string;                     // Worker
  
  // Details
  reason: string;                       // Why dispute was opened
  description?: string;                 // Detailed description
  evidenceIds?: string[];               // Related evidence IDs
  
  // Status
  status: "open" | "in_review" | "resolved";
  resolution?: "WORKER_WIN" | "BUYER_WIN" | "REFUND";
  
  // Resolution details
  resolvedBy?: string;                  // Admin/system that resolved
  resolutionNotes?: string;
  
  // Timestamps
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}
```

**Indexes**:
- `jobId` (disputes for job)
- `status` (open disputes)
- `createdAt` (newest first)

**Example**:
```json
{
  "id": "dispute_def456",
  "jobId": "job_abc123",
  "initiatorId": "customer_1",
  "buyerId": "customer_1",
  "workerId": "worker_2",
  "reason": "Work quality does not match requirements",
  "status": "resolved",
  "resolution": "WORKER_WIN",
  "resolutionNotes": "Evidence clearly shows work completion",
  "createdAt": "2024-06-23T14:00:00Z",
  "resolvedAt": "2024-06-23T14:30:00Z"
}
```

---

### 5. `trustScores`
Cached reputation scores for users.

**Document ID**: User ID

```typescript
{
  userId: string;                       // User ID
  score: number;                        // 0-100 trust score
  
  // Metrics
  jobsCompleted: number;
  jobsAccepted: number;
  disputeCount: number;
  disputesWon: number;
  verificationSuccessRate: number;      // 0-1 (percentage)
  averageRating: number;                // 0-5 stars
  
  // Timestamp
  lastUpdated: Timestamp;
}
```

**Indexes**:
- `score DESC` (leaderboards)

**Example**:
```json
{
  "userId": "worker_2",
  "score": 85,
  "jobsCompleted": 42,
  "jobsAccepted": 50,
  "disputeCount": 2,
  "disputesWon": 1,
  "verificationSuccessRate": 0.98,
  "averageRating": 4.8,
  "lastUpdated": "2024-06-23T14:00:00Z"
}
```

---

### 6. `payments`
Payment transaction records.

**Document ID**: UUID (random)

```typescript
{
  id: string;                           // Document ID (UUID)
  jobId: string;                        // Related job
  buyerId: string;                      // Payer
  workerId?: string;                    // Recipient
  
  // Amount
  amount: number;
  currency: string;                     // "USD", "EUR", etc.
  
  // Status
  status: "pending" | "succeeded" | "failed" | "refunded";
  
  // Stripe integration
  stripePaymentIntentId?: string;       // Stripe payment intent ID
  stripeChargeId?: string;              // Stripe charge ID
  
  // Metadata
  idempotencyKey: string;               // For deduplication
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Example**:
```json
{
  "id": "payment_ghi789",
  "jobId": "job_abc123",
  "buyerId": "customer_1",
  "workerId": "worker_2",
  "amount": 500,
  "currency": "USD",
  "status": "succeeded",
  "stripePaymentIntentId": "pi_1234567890",
  "idempotencyKey": "idempotency_key_here",
  "createdAt": "2024-06-23T11:00:00Z",
  "updatedAt": "2024-06-23T11:30:00Z"
}
```

---

### 7. `escrow`
Escrow fund management (money held in trust).

**Document ID**: UUID (random)

```typescript
{
  id: string;                           // Document ID (UUID)
  jobId: string;                        // Related job
  paymentRecordId: string;              // Link to payment
  
  // Participants
  buyerId: string;                      // Funds owner
  workerId: string;                     // Funds recipient
  
  // Amount
  amount: number;
  currency: string;
  
  // Status
  status: "held" | "released" | "refunded" | "disputed";
  
  // Blockchain (optional)
  blockchainTxHash?: string;            // Tx hash on blockchain
  contractAddress?: string;             // Smart contract address
  
  // Metadata
  idempotencyKey: string;               // For deduplication
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 8. `ratings`
User ratings and reviews.

**Document ID**: UUID (random)

```typescript
{
  id: string;
  recipientId: string;                  // Who is being rated
  authorId: string;                     // Who gave the rating
  jobId: string;                        // Related job
  
  rating: number;                       // 1-5 stars
  review?: string;                      // Written review
  
  createdAt: Timestamp;
}
```

---

### 9. `notifications`
(Future) User notifications.

**Document ID**: UUID (random)

```typescript
{
  id: string;
  userId: string;                       // Recipient
  type: string;                         // "job_accepted", "evidence_verified", etc.
  title: string;
  message: string;
  relatedId?: string;                   // Job ID, dispute ID, etc.
  
  read: boolean;
  readAt?: Timestamp;
  
  createdAt: Timestamp;
}
```

---

### 10. `idempotencyKeys`
Prevent duplicate requests.

**Document ID**: Hash of request

```typescript
{
  key: string;                          // Unique request key
  requestHash: string;                  // Hash of request body
  result: any;                          // Cached response
  
  createdAt: Timestamp;
  expiresAt: Timestamp;                 // When key expires (24 hours)
}
```

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their own documents
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // Jobs: owners can read/write, others can read public fields
    match /jobs/{jobId} {
      allow read: if true; // Public listing
      allow create, update, delete: if request.auth.uid == resource.data.buyerId 
                                      || request.auth.uid == resource.data.workerId;
    }

    // Evidence: uploader can read/write
    match /evidence/{evidenceId} {
      allow read, write: if request.auth.uid == resource.data.uploadedBy;
    }

    // Disputes: participants can read
    match /disputes/{disputeId} {
      allow read: if request.auth.uid == resource.data.buyerId 
                     || request.auth.uid == resource.data.workerId;
      allow write: if request.auth.uid == resource.data.initiatorId;
    }

    // Trust scores: public read
    match /trustScores/{userId} {
      allow read: if true;
    }

    // Others: authenticated access only
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Indexes Required

Create these composite indexes in Firestore:

| Collection | Fields | Order |
|-----------|--------|-------|
| users | role | Ascending |
| users | trustScore | Descending |
| users | createdAt | Descending |
| jobs | buyerId, state | Ascending |
| jobs | workerId, state | Ascending |
| jobs | state | Ascending |
| jobs | createdAt | Descending |
| evidence | jobId, createdAt | Descending |
| disputes | jobId, status | Ascending |
| trustScores | score | Descending |

---

## Data Validation

### Users Collection
- `email`: Must be valid email format, unique
- `name`: 2-100 characters
- `role`: Must be "customer" or "worker"
- `bio`: Max 500 characters (workers only)
- `skills`: Array of strings (workers only)

### Jobs Collection
- `title`: 3-100 characters
- `description`: 10-5000 characters
- `budget`: Must be positive number
- `currency`: ISO 4217 code
- `state`: Must be valid JobState enum

### Evidence Collection
- `latitude`: -90 to 90
- `longitude`: -180 to 180
- `imageUrl`: Valid HTTPS URL
- `aiVerificationScore`: 0-100 if present

### Disputes Collection
- `reason`: Required, non-empty string
- `resolution`: Must be valid resolution type
- `status`: Must be valid status

---

## Migration Scripts

### Create Collections (Manual)
```bash
# Run these in Firebase Console or via Admin SDK

# Users
db.collection('users').doc('test_user_1').set({...})

# Jobs
db.collection('jobs').doc('test_job_1').set({...})

# Evidence
db.collection('evidence').doc('test_evidence_1').set({...})

# Continue for all collections
```

### Backup/Export
```bash
# Export Firestore data
gcloud firestore export gs://bucket-name/backup-$(date +%s)

# Import from backup
gcloud firestore import gs://bucket-name/backup-timestamp
```

---

## Performance Considerations

1. **Document Size**: Keep individual documents < 1MB (most are < 100KB)
2. **Subcollections**: Not used in MVP, keep flat structure
3. **Denormalization**: Duplicate `trustScore` in users for quick display
4. **Caching**: TrustScores collection caches expensive calculations
5. **Batch Operations**: Use batch writes for atomic multi-document updates
6. **Rate Limiting**: Firestore has limits (25k writes/day on free tier)

---

## Example Queries

### Get user's jobs
```javascript
db.collection('jobs')
  .where('buyerId', '==', userId)
  .orderBy('createdAt', 'desc')
  .limit(10)
```

### Get jobs needing verification
```javascript
db.collection('jobs')
  .where('verificationStatus', '==', 'pending')
  .orderBy('createdAt')
```

### Get user's trust score
```javascript
db.collection('trustScores')
  .doc(userId)
  .get()
```

### Get top workers (leaderboard)
```javascript
db.collection('trustScores')
  .orderBy('score', 'desc')
  .limit(10)
```

---

## Notes

- All timestamps are server-generated (`Timestamp.now()`)
- All IDs are UUIDs except user IDs (Firebase UIDs)
- Document ID = primary key
- No joins needed (flat structure)
- Each collection is independent
- Updates must include `updatedAt` timestamp

