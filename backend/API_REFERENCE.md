# Magic Handshake MVP - API Reference

## Overview
This document outlines the core MVP API endpoints for Magic Handshake backend. All endpoints are prefixed with `/api`.

## Base URL
- Development: `http://localhost:3001/api`
- Production: `{API_URL}/api`

## Authentication
Currently using `x-user-id` header for user identification (TODO: Firebase Auth integration).
```
x-user-id: user_uuid
```

## Authentication API

### Register New User
**POST** `/auth/register`

Create a new user account with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "role": "worker"
}
```

**Response (201):**
```json
{
  "success": true,
  "userId": "uuid",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "worker",
    "trustScore": 50,
    "accountStatus": "active",
    "createdAt": "2024-06-23T14:00:00Z"
  },
  "message": "User registered successfully. Please log in with your credentials."
}
```

---

### Login User
**POST** `/auth/login`

Authenticate user and get session token. Requires Firebase ID token from client.

**Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1NjciLCJ0eXAiOiJKV1QifQ..."
}
```

**Response (200):**
```json
{
  "success": true,
  "userId": "uuid",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "worker",
    "trustScore": 85,
    "accountStatus": "active",
    "createdAt": "2024-06-23T14:00:00Z"
  },
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1NjciLCJ0eXAiOiJKV1QifQ...",
  "message": "Login successful"
}
```

---

### Get Current User Profile
**GET** `/auth/me`

Get logged-in user's profile information.

**Headers:**
```
x-user-id: user_uuid
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "worker",
    "phone": "+1234567890",
    "bio": "Experienced web developer",
    "skills": ["React", "TypeScript", "Node.js"],
    "trustScore": 85,
    "jobsCompleted": 42,
    "totalEarnings": 5000,
    "accountStatus": "active",
    "createdAt": "2024-06-23T14:00:00Z"
  }
}
```

---

### Update User Profile
**PUT** `/auth/profile`

Update user profile information.

**Headers:**
```
x-user-id: user_uuid
```

**Request Body:**
```json
{
  "name": "John Doe Updated",
  "phone": "+1234567890",
  "bio": "Senior web developer with 5 years experience",
  "skills": ["React", "TypeScript", "Node.js", "PostgreSQL"],
  "profileImage": "https://example.com/profile.jpg"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe Updated",
    "phone": "+1234567890",
    "bio": "Senior web developer with 5 years experience",
    "skills": ["React", "TypeScript", "Node.js", "PostgreSQL"],
    "profileImage": "https://example.com/profile.jpg",
    "updatedAt": "2024-06-23T14:30:00Z"
  },
  "message": "Profile updated successfully"
}
```

---

### Logout
**POST** `/auth/logout`

Logout current user (invalidates session on client).

**Headers:**
```
x-user-id: user_uuid
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Verify Token
**POST** `/auth/verify-token`

Check if a Firebase ID token is still valid.

**Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1NjciLCJ0eXAiOiJKV1QifQ..."
}
```

**Response (200):**
```json
{
  "success": true,
  "valid": true,
  "userId": "uuid"
}
```

Or if token is invalid:
```json
{
  "success": true,
  "valid": false,
  "message": "Token is invalid or expired"
}
```

---

## Jobs API

### Create Job
**POST** `/jobs`

Create a new job posting.

**Request Body:**
```json
{
  "title": "Fix my website",
  "description": "Need to fix the login page and add dark mode",
  "budget": 500,
  "currency": "USD",
  "deadline": "2024-07-01T00:00:00Z",
  "requiredSkills": ["React", "TypeScript"],
  "metadata": {}
}
```

**Response (201):**
```json
{
  "success": true,
  "jobId": "uuid",
  "job": {
    "id": "uuid",
    "title": "Fix my website",
    "buyerId": "buyer_uuid",
    "budget": 500,
    "state": "CREATED",
    "status": "active",
    "createdAt": "2024-06-23T14:00:00Z"
  }
}
```

---

### List Jobs
**GET** `/jobs`

List all jobs with optional filtering.

**Query Parameters:**
- `status` - Job status (active, accepted, in_progress, completed, cancelled)
- `buyerId` - Filter by buyer
- `workerId` - Filter by worker
- `state` - Job state (CREATED, FUNDED, IN_PROGRESS, etc.)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "count": 10,
  "total": 10,
  "jobs": [
    {
      "id": "uuid",
      "title": "Fix my website",
      "buyerId": "buyer_uuid",
      "budget": 500,
      "state": "CREATED",
      "status": "active",
      "createdAt": "2024-06-23T14:00:00Z"
    }
  ]
}
```

---

### Get Job Details
**GET** `/jobs/:id`

Get full details of a specific job.

**Response (200):**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "title": "Fix my website",
    "description": "Need to fix the login page and add dark mode",
    "buyerId": "buyer_uuid",
    "workerId": null,
    "budget": 500,
    "state": "CREATED",
    "status": "active",
    "metadata": {},
    "createdAt": "2024-06-23T14:00:00Z",
    "updatedAt": "2024-06-23T14:00:00Z"
  }
}
```

---

### Accept Job
**PUT** `/jobs/:id/accept`

Worker accepts a job.

**Headers:**
```
x-user-id: worker_uuid
```

**Request Body:**
```json
{
  "workerId": "worker_uuid"
}
```

**Response (200):**
```json
{
  "success": true,
  "jobId": "uuid",
  "workerId": "worker_uuid",
  "workerTrustScore": 85,
  "message": "Job accepted successfully"
}
```

Job state transitions: `CREATED` → `FUNDED`

---

### Start Work
**PUT** `/jobs/:id/start`

Worker starts work on accepted job.

**Headers:**
```
x-user-id: worker_uuid
```

**Response (200):**
```json
{
  "success": true,
  "jobId": "uuid",
  "state": "IN_PROGRESS",
  "message": "Work started successfully"
}
```

Job state transitions: `FUNDED` → `IN_PROGRESS`

---

### Cancel Job
**PUT** `/jobs/:id/cancel`

Buyer cancels a job (before work starts).

**Headers:**
```
x-user-id: buyer_uuid
```

**Response (200):**
```json
{
  "success": true,
  "jobId": "uuid",
  "state": "CANCELLED",
  "message": "Job cancelled successfully"
}
```

Job state transitions: `CREATED` or `FUNDED` → `CANCELLED`

---

## Evidence API

### Upload Evidence
**POST** `/evidence/upload`

Worker uploads work evidence (photo + GPS + timestamp).

**Headers:**
```
x-user-id: worker_uuid
Content-Type: multipart/form-data
```

**Form Data:**
- `jobId` - Job ID
- `image` - Image file (JPEG/PNG)
- `latitude` - GPS latitude
- `longitude` - GPS longitude
- `timestamp` - ISO 8601 timestamp

**Response (201):**
```json
{
  "success": true,
  "evidenceId": "uuid",
  "jobId": "uuid",
  "imageUrl": "https://blob.vercel-storage.com/...",
  "verificationStatus": "pending",
  "createdAt": "2024-06-23T14:00:00Z"
}
```

---

### Get Evidence
**GET** `/evidence/:jobId`

Retrieve all evidence for a job.

**Response (200):**
```json
{
  "success": true,
  "jobId": "uuid",
  "evidence": [
    {
      "id": "uuid",
      "imageUrl": "https://blob.vercel-storage.com/...",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "timestamp": "2024-06-23T14:00:00Z",
      "verificationStatus": "pending",
      "aiVerificationScore": 95,
      "createdAt": "2024-06-23T14:00:00Z"
    }
  ]
}
```

---

### Verify Evidence
**POST** `/evidence/:jobId/verify`

Trigger AI verification of evidence (mock returns 95% confidence).

**Headers:**
```
x-user-id: system_uuid
```

**Response (200):**
```json
{
  "success": true,
  "jobId": "uuid",
  "verdict": "approved",
  "confidence": 0.95,
  "completionScore": 92,
  "analysis": "Work quality meets requirements",
  "suggestedAction": "release"
}
```

---

## Disputes API

### Create Dispute
**POST** `/disputes/create`

Initiate a dispute on a job.

**Headers:**
```
x-user-id: user_uuid
```

**Request Body:**
```json
{
  "jobId": "uuid",
  "reason": "Work quality is poor",
  "evidenceIds": ["evidence_uuid_1", "evidence_uuid_2"]
}
```

**Response (201):**
```json
{
  "success": true,
  "disputeId": "uuid",
  "jobId": "uuid",
  "status": "open",
  "createdAt": "2024-06-23T14:00:00Z"
}
```

---

### Get Dispute
**GET** `/disputes/:jobId`

Retrieve dispute information for a job.

**Response (200):**
```json
{
  "success": true,
  "dispute": {
    "id": "uuid",
    "jobId": "uuid",
    "buyerId": "buyer_uuid",
    "workerId": "worker_uuid",
    "reason": "Work quality is poor",
    "status": "open",
    "resolution": null,
    "createdAt": "2024-06-23T14:00:00Z"
  }
}
```

---

### Resolve Dispute
**POST** `/disputes/:id/resolve`

Admin/system resolves a dispute (mock manual review).

**Headers:**
```
x-user-id: admin_uuid
```

**Request Body:**
```json
{
  "resolution": "WORKER_WIN",
  "notes": "Evidence clearly shows work completion"
}
```

**Response (200):**
```json
{
  "success": true,
  "disputeId": "uuid",
  "jobId": "uuid",
  "resolution": "WORKER_WIN",
  "message": "Dispute resolved"
}
```

---

## Trust Score API

### Get User Trust Score
**GET** `/trust-scores/:userId`

Get calculated trust score for a user.

**Response (200):**
```json
{
  "success": true,
  "userId": "uuid",
  "score": 85,
  "jobsCompleted": 42,
  "jobsAccepted": 45,
  "disputeCount": 2,
  "disputesWon": 1,
  "verificationSuccessRate": 0.98,
  "averageRating": 4.8,
  "lastUpdated": "2024-06-23T14:00:00Z"
}
```

---

## State Machine API

### Get Valid Transitions
**GET** `/state-machine/valid-transitions/:state`

Get all valid next states from current state.

**Response (200):**
```json
{
  "currentState": "FUNDED",
  "validNextStates": ["IN_PROGRESS", "REFUNDED"],
  "count": 2
}
```

---

## Job Lifecycle Flow

```
CREATED
  ├─ Accept Job (worker) → FUNDED
  ├─ Cancel (buyer) → CANCELLED
  └─ Refund → REFUNDED

FUNDED
  ├─ Start Work → IN_PROGRESS
  └─ Refund → REFUNDED

IN_PROGRESS
  ├─ Submit Evidence → EVIDENCE_SUBMITTED
  ├─ Open Dispute → DISPUTED
  └─ Cancel → CANCELLED

EVIDENCE_SUBMITTED
  ├─ AI Verification → VERIFIED
  └─ Open Dispute → DISPUTED

VERIFIED
  ├─ Release Payment → RELEASED
  └─ Open Dispute → DISPUTED

DISPUTED
  ├─ Resolve (worker wins) → RELEASED
  └─ Resolve (customer wins) → REFUNDED

RELEASED (Final)
CANCELLED (Final)
REFUNDED (Final)
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "issues": [
    {
      "code": "too_small",
      "minimum": 3,
      "type": "string",
      "path": ["title"],
      "message": "String must contain at least 3 character(s)"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized: User ID required"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden: Only buyer can cancel"
}
```

### 404 Not Found
```json
{
  "error": "Job not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create job",
  "message": "Error details..."
}
```

---

## Configuration

### Environment Variables
```env
# API
PORT=3001
API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000

# Firebase
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Redis (for queues)
REDIS_URL=redis://localhost:6379

# AI Service
USE_MOCK_AI=true  # Set to 'false' to use real OpenAI
OPENAI_API_KEY=... (optional)

# Stripe
STRIPE_SECRET_KEY=...
```

---

## Testing Checklist

- [ ] Health check: `GET /health` returns 200
- [ ] Create job: `POST /api/jobs` returns 201
- [ ] List jobs: `GET /api/jobs` returns list
- [ ] Get job: `GET /api/jobs/:id` returns job
- [ ] Accept job: `PUT /api/jobs/:id/accept` changes state to FUNDED
- [ ] Start work: `PUT /api/jobs/:id/start` changes state to IN_PROGRESS
- [ ] Upload evidence: `POST /api/evidence/upload` returns 201
- [ ] Verify evidence: `POST /api/evidence/:jobId/verify` returns verdict
- [ ] Create dispute: `POST /api/disputes/create` returns 201
- [ ] Resolve dispute: `POST /api/disputes/:id/resolve` returns resolution
- [ ] Get trust score: `GET /trust-scores/:userId` returns score
- [ ] State transitions: All endpoints respect job state machine
