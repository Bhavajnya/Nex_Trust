# Magic Handshake MVP

**A decentralized proof-of-work verification platform for gig economy jobs**

## Overview

Magic Handshake is a blockchain-ready platform that enables customers to post jobs, workers to complete them, and uses AI + GPS verification to ensure work quality before releasing payment. The MVP is 95% complete and ready for comprehensive testing.

### Key Features

- 🎯 **Job Management** - Create, accept, and complete jobs
- 📸 **Evidence Capture** - Upload photos/videos as proof of work
- 🗺️ **GPS Verification** - Validate worker location against job requirements
- 🤖 **AI Analysis** - Automated evidence verification using OpenAI
- 💰 **Escrow & Payments** - Secure payment release after verification via Stripe
- 🔐 **Authentication** - User sign in/up with Firebase
- 📊 **State Machine** - Robust job state transitions with guards
- 🚀 **Queue Processing** - Background verification via BullMQ + Redis

## Current Status

| Component | Status | Score |
|-----------|--------|-------|
| Frontend | 95% Complete | ✅ |
| Backend | 95% Complete | ✅ |
| Integration | 95% Complete | ✅ |
| Testing | In Progress | 🔄 |
| Deployment | Ready | 🔄 |

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Firebase account with Firestore
- Stripe account (test or production)
- Vercel Blob token
- OpenAI API key
- Redis instance

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.development.local .env.local

# Start backend
cd backend && npm run dev

# Start frontend (in another terminal)
cd frontend && npm run dev

# Backend runs on http://localhost:3001
# Frontend runs on http://localhost:3000
```

### First Test

1. Go to http://localhost:3000
2. Sign up as a new user
3. Switch to "Customer" role
4. Create a job
5. Switch to "Worker" role (new browser window)
6. Accept the job
7. Upload evidence with GPS enabled
8. Monitor the verification pipeline

See `VALIDATION_CHECKLIST.md` for complete testing procedures.

## Documentation

### For First-Time Users

- **[Quick Reference](./QUICK_REFERENCE.md)** - 5-minute overview
- **[MVP Readiness Report](./MVP_READINESS_REPORT.md)** - Current status & limitations
- **[Validation Checklist](./VALIDATION_CHECKLIST.md)** - How to test everything

### For Developers

- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Technical details
- **[Code Changes Reference](./CODE_CHANGES_REFERENCE.md)** - What changed and why
- **[E2E Lifecycle Tests](./E2E_LIFECYCLE_TEST.md)** - Test scenarios in depth

### For Operations

- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - How to deploy to production
- **[Testing Guide](./TESTING_GUIDE.md)** - Test methodology
- **[Fixes Applied](./FIXES_APPLIED.md)** - Recent bug fixes

## Project Structure

```
magic-handshake/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── routes/            # API endpoints (/jobs, /evidence, /payments)
│   │   ├── services/          # Business logic (JobService, EvidenceService)
│   │   ├── workers/           # Queue processors (verification, fraud detection)
│   │   ├── middleware/        # Auth, validation, error handling
│   │   ├── queues/            # BullMQ queue setup
│   │   └── types/             # TypeScript interfaces
│   ├── package.json
│   └── README.md
│
├── frontend/                   # React + Next.js
│   ├── src/
│   │   ├── routes/            # Pages (index, dashboard, disputes)
│   │   ├── components/        # Reusable components
│   │   ├── context/           # Auth context provider
│   │   ├── lib/               # API client, utilities
│   │   └── styles/            # Global CSS, theme
│   ├── package.json
│   └── README.md
│
├── Documentation/
│   ├── VALIDATION_CHECKLIST.md      ← START HERE
│   ├── MVP_READINESS_REPORT.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── QUICK_REFERENCE.md
│   ├── E2E_LIFECYCLE_TEST.md
│   └── ...other guides
│
└── package.json                # Monorepo root (pnpm workspaces)
```

## How It Works

### The Magic Handshake Flow

```
1. CUSTOMER CREATES JOB
   ↓ [Customer fills form with location, budget]
   ✓ Job created in CREATED state

2. SYSTEM FUNDS ESCROW
   ↓ [Payment held in escrow via Stripe]
   ✓ Job transitions to FUNDED

3. WORKER ACCEPTS & STARTS
   ↓ [Worker clicks "Accept Job", then "Start Work"]
   ✓ Job transitions to ACCEPTED → IN_PROGRESS

4. WORKER UPLOADS EVIDENCE
   ↓ [Worker selects photo/video, system captures GPS]
   ✓ Evidence stored in Vercel Blob
   ✓ Job transitions to EVIDENCE_SUBMITTED

5. AI VERIFICATION (Background)
   ↓ [AI analyzes image content, checks GPS distance]
   ✓ GPS validates worker location (< 1km from job)
   ✓ Evidence marked as VERIFIED

6. JOB STATE TRANSITIONS
   ↓ [Verification result triggers state change]
   ✓ Job automatically transitions to VERIFIED

7. PAYMENT RELEASES (Automatic)
   ↓ [Payment coordinator releases escrow]
   ✓ Stripe transfer created
   ✓ Worker receives payout
   ✓ Job transitions to RELEASED

8. WORKER CREDITED
   ✓ Payment appears in worker account
   ✓ Workflow complete
```

### State Machine

```
CREATED (Customer creates job)
  ↓
FUNDED (Escrow funded)
  ↓
ACCEPTED (Worker accepts)
  ↓
IN_PROGRESS (Worker starts)
  ↓
EVIDENCE_SUBMITTED (Worker uploads proof)
  ↓
VERIFIED (AI & GPS validation passes)
  ↓
RELEASED (Payment released, worker paid) [TERMINAL]

Alternative paths:
- EVIDENCE_SUBMITTED → EVIDENCE_SUBMITTED (if verification fails, can retry)
- Any state → DISPUTED (if conflict arises) [TERMINAL]
- Any state → CANCELLED (if cancelled) [TERMINAL]
```

## API Endpoints

### Jobs

```
POST   /api/jobs                 # Create job
GET    /api/jobs                 # List jobs (with role filtering)
GET    /api/jobs/:jobId          # Get job details
PATCH  /api/jobs/:jobId/accept   # Accept job (worker)
PATCH  /api/jobs/:jobId/start    # Start job (worker)
```

### Evidence

```
POST   /api/evidence/upload      # Upload evidence (multipart/form-data)
GET    /api/evidence/:id         # Get evidence details
GET    /api/evidence/job/:jobId  # List evidence for job
```

### Payments

```
POST   /api/payments/release     # Release payment (admin)
GET    /api/payments/job/:jobId  # Get job payments
```

### Auth

```
POST   /api/auth/signin          # Sign in
POST   /api/auth/signup          # Sign up
POST   /api/auth/signout         # Sign out
GET    /api/auth/me              # Current user
```

## Testing

### Quick Test (5 minutes)

Follow the "First Test" section above.

### Comprehensive Test (30 minutes)

See `VALIDATION_CHECKLIST.md` for 5 detailed test cases:
1. Complete happy path
2. GPS failure scenario
3. Missing GPS handling
4. Duplicate upload prevention
5. Invalid state transitions

### What Gets Tested

- ✅ Job creation and state transitions
- ✅ Evidence upload to Vercel Blob
- ✅ GPS location verification
- ✅ AI analysis integration
- ✅ Automatic payment release
- ✅ Error handling and recovery
- ✅ Authentication and authorization
- ✅ Queue-based processing

## Deployment

### Development

```bash
# Backend and frontend run in development mode with hot reload
pnpm install
npm run dev  # (in backend or frontend directory)
```

### Production

See `DEPLOYMENT_GUIDE.md` for complete instructions. Options:

- **Vercel** (Recommended) - Easiest deployment
- **Self-Hosted** - Full control, more configuration
- **Docker** - Containerized deployment

### Environment Variables

Required for production:

```
STRIPE_SECRET_KEY              # Stripe API key
STRIPE_PUBLISHABLE_KEY         # Stripe public key
FIREBASE_ADMIN_SDK_KEY         # Firebase credentials
OPENAI_API_KEY                 # OpenAI API key
BLOB_READ_WRITE_TOKEN          # Vercel Blob token
JWT_SECRET                     # JWT signing secret
REDIS_URL                      # Redis connection
NEXT_PUBLIC_API_URL            # Frontend API endpoint
```

See `.env.development.local` for full list.

## Troubleshooting

### Backend Won't Start

```bash
# Check environment variables
echo $STRIPE_SECRET_KEY

# Check port availability
lsof -i :3001

# Check logs
npm run dev 2>&1 | head -50
```

### Frontend Won't Load

```bash
# Check API connection
curl http://localhost:3001/health

# Check browser console for CORS errors
# Verify NEXT_PUBLIC_API_URL is correct
```

### Evidence Upload Fails

```bash
# Check Vercel Blob token
echo $BLOB_READ_WRITE_TOKEN

# Check browser console for network errors
# Verify file size < 100MB
```

### Payment Won't Release

```bash
# Check Stripe keys in Stripe dashboard
# Verify webhook is configured
# Check backend logs for Stripe errors
```

## Architecture

### Frontend Architecture

- **Framework:** React 19 + Next.js 16
- **State Management:** React Context + SWR
- **Styling:** Tailwind CSS v4
- **Component Library:** shadcn/ui
- **Auth:** Firebase Authentication

### Backend Architecture

- **Framework:** Express.js + TypeScript
- **Database:** Firebase Firestore
- **Queue:** BullMQ + Redis
- **Payment:** Stripe API
- **AI:** OpenAI API
- **Storage:** Vercel Blob
- **Auth:** Firebase Admin SDK + JWT

### Integration Architecture

```
Frontend (React/Next.js)
    ↓ HTTPS
API Server (Express.js)
    ├─→ Firestore (Jobs, Evidence, Users)
    ├─→ Redis + BullMQ (Queue)
    ├─→ Stripe API (Payments)
    ├─→ OpenAI API (Verification)
    ├─→ Vercel Blob (Evidence Storage)
    └─→ Firebase Auth (Authentication)
```

## Known Limitations

### Current MVP

- ✋ Error messages use `console.error` (not toast notifications)
- ✋ No real-time updates (requires page refresh)
- ✋ Notifications mock with `console.log`
- ✋ No blockchain integration
- ✋ No advanced fraud detection
- ✋ No KYC implementation

### Acceptable for MVP

All limitations above are documented as acceptable for the MVP phase.

## Next Steps

### Phase 2 (After MVP Sign-Off)

- [ ] Toast notifications (vs console.log)
- [ ] Real-time updates (WebSocket)
- [ ] Automated test suite
- [ ] Advanced error handling
- [ ] Performance optimization

### Phase 3 (Future)

- [ ] Blockchain integration
- [ ] Mobile app (React Native)
- [ ] Admin dashboard
- [ ] Advanced fraud detection
- [ ] KYC integration

## Support

### For Developers

- See `QUICK_REFERENCE.md` for quick answers
- Check `CODE_CHANGES_REFERENCE.md` for implementation details
- Review backend/README.md and frontend/README.md

### For Operations

- See `DEPLOYMENT_GUIDE.md` for deployment questions
- Check `VALIDATION_CHECKLIST.md` for testing procedures
- Review infrastructure documentation

### Reporting Issues

1. Check existing documentation
2. Search GitHub issues
3. Create detailed bug report with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details
   - Console/server logs

## Contributing

Before submitting changes:

1. Create feature branch
2. Make changes
3. Update relevant documentation
4. Test thoroughly (see `VALIDATION_CHECKLIST.md`)
5. Submit pull request with description

## License

[Your License Here]

## Contact

- **Email:** support@magichandshake.io
- **Issues:** GitHub Issues
- **Discussion:** GitHub Discussions

---

## Quick Links

| Document | Purpose | Audience |
|----------|---------|----------|
| [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md) | Complete test suite | QA, Developers |
| [MVP_READINESS_REPORT.md](./MVP_READINESS_REPORT.md) | Current status & metrics | Product, Management |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | How to deploy | DevOps, Developers |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | Quick answers | Everyone |
| [E2E_LIFECYCLE_TEST.md](./E2E_LIFECYCLE_TEST.md) | Detailed test scenarios | QA, Developers |
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | Technical deep dive | Developers |

---

**Current Version:** 0.1.0 (MVP)  
**Status:** Ready for Validation Testing  
**Last Updated:** June 23, 2025

**Next Milestone:** Production Deployment (after testing phase)
