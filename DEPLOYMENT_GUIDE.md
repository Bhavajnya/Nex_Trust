# Magic Handshake MVP - Deployment & Launch Guide

**Version:** 0.1.0  
**Status:** Ready for Testing Phase  
**Last Updated:** June 23, 2025

---

## Overview

This guide walks through the complete deployment process for the Magic Handshake MVP. The system is currently at 95% completion and ready for validation testing before production deployment.

---

## Phase 1: Validation Testing (Current Phase)

Before deployment, complete all validation tests to ensure the system works end-to-end.

### Step 1: Run Validation Tests

```bash
# See VALIDATION_CHECKLIST.md for detailed test procedures
# Follow the 5 test cases in order
# Record results in the checklist
```

### Success Criteria

- [x] Test Case 1 (Happy Path) passes
- [x] Test Case 2 (GPS Failure) passes
- [x] Test Case 3 (No GPS) passes
- [x] Test Case 4 (Duplicate Upload) passes
- [x] Test Case 5 (Invalid Transitions) passes
- [x] All console output shows expected flow
- [x] No runtime errors
- [x] Payment processed correctly

### If Tests Fail

1. **Identify the issue** - Check which test failed
2. **Debug** - Use console logs and Firestore console to inspect state
3. **Fix** - Update code based on findings
4. **Re-test** - Run the failing test again
5. **Repeat** - Continue until all tests pass

---

## Phase 2: Pre-Production Setup

Once validation tests pass, prepare for production deployment.

### Step 1: Environment Configuration

#### Verify All Environment Variables

```bash
# Create .env.production file
cp .env.development.local .env.production

# Update with production values
# DO NOT commit this file - use Vercel/hosting platform secrets

# Required variables:
# STRIPE_SECRET_KEY (production key, not test)
# STRIPE_PUBLISHABLE_KEY
# FIREBASE_ADMIN_SDK_KEY
# OPENAI_API_KEY
# BLOB_READ_WRITE_TOKEN
# JWT_SECRET
# DATABASE_URL (if using external DB)
# REDIS_URL (for queue)
```

#### Security Checklist

- [ ] No secrets in code (only in env)
- [ ] All API keys are production keys
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] HTTPS enforced
- [ ] Security headers set
- [ ] Input validation enabled
- [ ] SQL injection protection enabled

### Step 2: Database Setup

#### Firebase

```bash
# 1. Create production Firebase project
# Go to https://console.firebase.google.com
# Create new project

# 2. Set up Firestore
# Enable Firestore Database
# Choose production mode

# 3. Create indexes (auto-created when needed)
# Required indexes:
# - jobs collection: state + userId
# - evidence collection: jobId + status
# - payments collection: jobId + status

# 4. Update environment
# Copy Firebase credentials to .env.production
```

#### Redis (for Queue)

```bash
# Option 1: Redis Cloud
# 1. Sign up at redis.com
# 2. Create free tier database
# 3. Copy connection string to .env.production

# Option 2: Self-hosted Redis
# docker run -d -p 6379:6379 redis:latest
```

### Step 3: Third-Party Service Setup

#### Stripe Production Account

```bash
# 1. Upgrade to production account
# https://stripe.com/dashboard

# 2. Verify identity
# Upload business documents

# 3. Get production API keys
# Settings → API Keys
# Copy Secret Key to .env.production

# 4. Set up webhooks
# https://dashboard.stripe.com/webhooks
# Endpoint: https://yourdomain.com/api/webhooks/stripe
# Events: payment_intent.succeeded, charge.refunded
```

#### Vercel Blob

```bash
# 1. Configure Blob storage
# Vercel Dashboard → Storage → Create → Blob

# 2. Create access token
# Copy to .env.production as BLOB_READ_WRITE_TOKEN

# 3. Test upload
# Run: node backend/scripts/test-blob.js
```

#### OpenAI API

```bash
# 1. Sign up for OpenAI API
# https://platform.openai.com/

# 2. Create API key
# https://platform.openai.com/account/api-keys

# 3. Set billing limits
# Go to Settings → Billing
# Set monthly budget to prevent runaway charges

# 4. Copy key to .env.production
```

---

## Phase 3: Build & Test

### Step 1: Build Backend

```bash
cd backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests (if available)
npm test

# Check for errors
npm run lint
```

### Step 2: Build Frontend

```bash
cd frontend

# Install dependencies
npm install

# Build Next.js
npm run build

# Verify build output
ls .next/
```

### Step 3: Verify Builds

```bash
# Backend should compile without errors
# Frontend should create .next directory

# Check output sizes
du -sh backend/dist
du -sh frontend/.next
```

---

## Phase 4: Deployment Options

### Option A: Vercel (Recommended)

#### Backend Deployment

```bash
# 1. Create Vercel project
# https://vercel.com/new

# 2. Connect git repository
# Select /backend as root directory

# 3. Add environment variables
# Vercel Dashboard → Settings → Environment Variables
# Add all production env vars

# 4. Deploy
# Push to main branch to auto-deploy
# Or manually deploy: vercel deploy --prod
```

#### Frontend Deployment

```bash
# 1. Create Vercel project for frontend
# https://vercel.com/new

# 2. Connect git repository
# Select /frontend as root directory

# 3. Add environment variables
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# 4. Deploy
# vercel deploy --prod
```

### Option B: Self-Hosted (AWS, DigitalOcean, etc.)

#### Backend

```bash
# 1. Create VM/Container
# e.g., EC2 on AWS, Droplet on DigitalOcean

# 2. Install Node.js & npm
# apt-get update && apt-get install nodejs npm

# 3. Clone repository
git clone <repo-url>
cd backend

# 4. Install dependencies
npm install --production

# 5. Build
npm run build

# 6. Start with PM2 (process manager)
npm install -g pm2
pm2 start "npm run start" --name "magic-handshake-api"
pm2 startup
pm2 save

# 7. Configure nginx reverse proxy
# Point 80/443 to localhost:3001
```

#### Frontend

```bash
# 1. Build
cd frontend
npm run build

# 2. Start Next.js production server
npm run start

# Or use pm2
pm2 start "npm run start" --name "magic-handshake-web"
```

### Option C: Docker Deployment

```bash
# 1. Create Dockerfile for backend
cat > backend/Dockerfile << 'EOF'
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
EOF

# 2. Create Dockerfile for frontend
cat > frontend/Dockerfile << 'EOF'
FROM node:18 as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
CMD ["npm", "run", "start"]
EOF

# 3. Build images
docker build -t magic-handshake-api backend/
docker build -t magic-handshake-web frontend/

# 4. Run containers
docker run -d -p 3001:3001 --env-file .env.production magic-handshake-api
docker run -d -p 3000:3000 magic-handshake-web
```

---

## Phase 5: Post-Deployment Verification

### Step 1: Health Checks

```bash
# Backend health check
curl https://api.yourdomain.com/health

# Should return: { "status": "ok" }

# Frontend health check
curl https://yourdomain.com/

# Should return HTML with title "Magic Handshake"
```

### Step 2: Smoke Tests

```bash
# 1. Sign in to frontend
# Go to https://yourdomain.com
# Sign in with test account

# 2. Create test job
# Click "Create Job"
# Fill form and submit

# 3. Check backend logs
# Should see: [Job] Created: {jobId}

# 4. Check Firestore
# Verify job appears in firestore.google.com
```

### Step 3: Monitor Systems

```bash
# Set up monitoring
# - Application logs (CloudWatch, Datadog, etc.)
# - Error tracking (Sentry)
# - Uptime monitoring (StatusPage)
# - Performance monitoring (New Relic)
```

---

## Phase 6: Launch

### Pre-Launch Checklist

- [ ] All validation tests passed
- [ ] Environment configured
- [ ] Services deployed
- [ ] Health checks passing
- [ ] Smoke tests completed
- [ ] Monitoring active
- [ ] Logging configured
- [ ] Backups configured
- [ ] Team trained
- [ ] Runbook created

### Launch Steps

1. **Announce Launch**
   - Post on social media
   - Send email to beta users
   - Update website

2. **Monitor First 24 Hours**
   - Watch error logs
   - Monitor performance
   - Be ready to rollback

3. **Gradually Increase Users**
   - Start with beta users
   - Add more users over time
   - Monitor for issues

4. **Collect Feedback**
   - Get user feedback
   - Track bug reports
   - Prioritize fixes

---

## Post-Launch Operations

### Daily

- [ ] Check error logs
- [ ] Verify all services running
- [ ] Check payment processing
- [ ] Monitor queue backlog

### Weekly

- [ ] Review analytics
- [ ] Check performance metrics
- [ ] Review user feedback
- [ ] Plan for next iteration

### Monthly

- [ ] Database optimization
- [ ] Security audit
- [ ] Capacity planning
- [ ] Team retrospective

---

## Troubleshooting

### Backend Not Starting

```bash
# Check logs
pm2 logs magic-handshake-api

# Common issues:
# 1. Missing environment variables - Add to .env
# 2. Port already in use - Change PORT or kill process
# 3. Database connection - Verify Firebase/Database URL
# 4. Redis connection - Verify REDIS_URL
```

### Frontend Not Loading

```bash
# Check browser console
# Look for CORS errors - Update CORS configuration
# Look for API errors - Verify API_URL is correct
# Check Next.js build output
```

### Payment Not Processing

```bash
# 1. Check Stripe logs
# https://dashboard.stripe.com/logs

# 2. Verify webhook configured
# https://dashboard.stripe.com/webhooks

# 3. Check backend logs for Stripe errors
# Look for: [Stripe] Error

# 4. Verify API key is correct
# Compare with Stripe dashboard
```

### Evidence Upload Failing

```bash
# 1. Check Vercel Blob configuration
# Verify BLOB_READ_WRITE_TOKEN is set

# 2. Check Multer configuration
# Verify file size limit

# 3. Check browser console
# Look for CORS or network errors

# 4. Check backend logs
# Look for: [EvidenceRoute] Error uploading
```

---

## Rollback Procedure

If critical issues emerge post-launch:

```bash
# Option 1: Revert to previous commit
git revert <commit-hash>
git push origin main

# Option 2: Redeploy previous version
vercel deploy --prod --prev

# Option 3: Manual rollback
# Stop current services
pm2 stop magic-handshake-api
pm2 stop magic-handshake-web

# Checkout previous version
git checkout <previous-version>
npm run build

# Start old version
pm2 start "npm run start"
```

---

## Performance Optimization

### After Launch

Monitor performance and optimize:

```bash
# 1. Database Indexes
# Add indexes for common queries
# Query patterns:
# - Find jobs by state: db.jobs.find({state: "VERIFIED"})
# - Find evidence by job: db.evidence.find({jobId})
# - Find payments by user: db.payments.find({userId})

# 2. Caching
# Add Redis caching for:
# - User profiles
# - Job listings
# - Verification results

# 3. Code Optimization
# Profile with Node.js profiler
# node --prof backend/dist/index.js
# node --prof-process isolate-*.log > profile.txt
```

---

## Support & Runbook

### Escalation Path

1. **Developer On-Call** - First responder
2. **Tech Lead** - Complex issues
3. **DevOps** - Infrastructure issues
4. **External Support** - Third-party services

### Communication

- **Slack Channel:** #magic-handshake-incidents
- **Status Page:** status.yourdomain.com
- **Customer Support:** support@yourdomain.com

### Incident Response

1. **Detect** - Monitor alerts
2. **Assess** - Determine severity
3. **Notify** - Alert team
4. **Mitigate** - Implement fix
5. **Monitor** - Verify stability
6. **Document** - Post-mortem

---

## Sign-Off

Before launching to production, get sign-off from:

| Role | Responsibility | Status |
|------|-----------------|--------|
| Developer | Code quality | [ ] |
| QA | Testing complete | [ ] |
| DevOps | Infrastructure ready | [ ] |
| Product | Requirements met | [ ] |
| Security | Security audit | [ ] |

---

## Additional Resources

- [Vercel Deployment Guide](https://vercel.com/docs)
- [Firebase Deployment Guide](https://firebase.google.com/docs/hosting)
- [Stripe Production Guide](https://stripe.com/docs/keys)
- [Node.js Production Checklist](https://nodejs.org/en/docs/guides/nodejs-in-production/)
- [Security Best Practices](https://owasp.org/www-project-top-ten/)

---

**Document Status:** READY FOR DEPLOYMENT  
**Last Review:** 2025-06-23  
**Next Review:** Post-launch
