# Database Setup Guide - Magic Handshake MVP

This guide walks you through setting up Firestore for the Magic Handshake application.

---

## Prerequisites

- Firebase project created at [console.firebase.google.com](https://console.firebase.google.com)
- Firestore database enabled (Realtime Database is NOT needed)
- Firebase credentials JSON downloaded
- Node.js 18+ installed

---

## Step 1: Create Firebase Project

If you don't have a Firebase project yet:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a new project"
3. Enter project name: `magic-handshake`
4. Accept default settings and create
5. Wait for project to be created

---

## Step 2: Enable Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Select region: **us-central1** (or closest to you)
4. Start in **Production mode**
5. Click **Create**
6. Wait for Firestore to be enabled (1-2 minutes)

---

## Step 3: Set Up Firebase Credentials

### Get Service Account Key

1. Go to Firebase Console → **Project Settings** (gear icon)
2. Go to **Service Accounts** tab
3. Click **Generate New Private Key**
4. Save the JSON file as `firebase-credentials.json` in `/backend` directory

### File Structure

```
backend/
├── firebase-credentials.json    ← Place credentials here
├── scripts/
│   └── setup-firestore.ts
└── src/
    └── server.ts
```

### Environment Variable (Optional)

You can also set:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/firebase-credentials.json"
```

---

## Step 4: Install Dependencies

From the `backend` directory:

```bash
npm install
```

Ensure these are installed:
- `firebase-admin` (v12+)
- `typescript` (v5.7+)
- `@types/node`

---

## Step 5: Initialize Collections

Run the setup script:

```bash
npx ts-node scripts/setup-firestore.ts
```

This will:
- ✅ Create all 10 collections
- ✅ Add test data (2 users, 1 job, evidence, etc.)
- ✅ Set up initial trust scores
- ✅ Create sample disputes, payments, escrow

**Expected Output:**
```
🚀 Starting Firestore setup...

📝 Setting up Users collection...
✅ Users collection initialized

📝 Setting up Trust Scores collection...
✅ Trust Scores collection initialized

... (continues for all collections)

✨ ========== SETUP COMPLETE ========== ✨
✅ All collections initialized with test data
```

---

## Step 6: Apply Security Rules

1. Go to Firebase Console → **Firestore Database** → **Rules** tab
2. Replace the default rules with:

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

3. Click **Publish**

---

## Step 7: Create Composite Indexes

Go to Firebase Console → **Firestore Database** → **Indexes** tab

Create these composite indexes:

### 1. Users Collection
| Field | Order | Status |
|-------|-------|--------|
| role | Ascending | Required |
| trustScore | Descending | Required |
| createdAt | Descending | Required |

### 2. Jobs Collection
| Fields | Order | Status |
|--------|-------|--------|
| buyerId, state | Ascending | Required |
| workerId, state | Ascending | Required |
| state | Ascending | Optional |
| createdAt | Descending | Optional |

### 3. Evidence Collection
| Fields | Order | Status |
|--------|-------|--------|
| jobId, createdAt | Descending | Optional |
| verificationStatus | Ascending | Optional |

### 4. Disputes Collection
| Fields | Order | Status |
|--------|-------|--------|
| jobId, status | Ascending | Optional |
| createdAt | Descending | Optional |

### 5. Trust Scores Collection
| Field | Order | Status |
|-------|-------|--------|
| score | Descending | Optional |

**Note:** Firestore may auto-create some indexes when you run queries. The "Optional" ones will be suggested in the console.

---

## Step 8: Verify Setup

### Check Collections in Console

1. Go to Firebase Console → **Firestore Database** → **Data** tab
2. You should see these collections:
   - `users` (2 documents)
   - `trustScores` (2 documents)
   - `jobs` (1 document)
   - `evidence` (1 document)
   - `disputes` (1 document)
   - `payments` (1 document)
   - `escrow` (1 document)
   - `ratings` (1 document)
   - `notifications` (1 document)
   - `idempotencyKeys` (1 document)

### Test API Endpoints

Start the backend:

```bash
npm run dev
```

Test a simple endpoint:

```bash
curl http://localhost:3001/api/auth/me \
  -H "x-user-id: test-user-001"
```

Expected response:
```json
{
  "success": true,
  "user": {
    "id": "test-user-001",
    "email": "customer@example.com",
    "name": "John Customer",
    "trustScore": 50,
    "role": "customer"
  }
}
```

---

## Step 9: Access Control & Production Setup

### Development Mode (Current)
- Security rules are permissive
- Anyone can read most collections
- Good for local testing

### Production Mode (Later)
When deploying to production:

1. **Disable public reads:**
   ```javascript
   match /jobs/{jobId} {
     allow read: if request.auth != null;
     allow create: if request.auth.uid == request.resource.data.buyerId;
   }
   ```

2. **Add rate limiting:** Enable in Firebase Console → Firestore → Settings

3. **Enable backups:** Firestore → Backups → Create backup schedule

4. **Monitor usage:** Analytics dashboard → Firestore usage

---

## Step 10: Database Maintenance

### Regular Tasks

**Daily:**
- Monitor error rates in Firestore console
- Check query performance

**Weekly:**
- Review security rules for issues
- Check storage usage
- Clean up test data

**Monthly:**
- Create backup export
- Review composite indexes
- Optimize slow queries

### Backup & Export

**Create Backup:**
```bash
gcloud firestore databases backup create
```

**Export to Cloud Storage:**
```bash
gcloud firestore export gs://bucket-name/backup-$(date +%s)
```

**Import from Backup:**
```bash
gcloud firestore import gs://bucket-name/backup-timestamp
```

---

## Troubleshooting

### Error: "Service account credentials not found"

**Solution:**
1. Ensure `firebase-credentials.json` is in `/backend` directory
2. Or set `GOOGLE_APPLICATION_CREDENTIALS` environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
   ```

### Error: "Project not found"

**Solution:**
1. Check project ID in credentials JSON matches Firebase Console
2. Ensure Firestore is enabled in the project

### Error: "Permission denied"

**Solution:**
1. Check security rules (should be permissive for development)
2. Ensure user ID in header matches document owner
3. Check Firestore rules in console

### Slow Queries

**Solution:**
1. Add composite indexes (Firestore will suggest them)
2. Limit results: `.limit(10)` or `.limit(100)`
3. Use pagination: start cursor for next page
4. Filter by indexed fields first

### Collections Not Appearing

**Solution:**
1. Re-run setup script: `npx ts-node scripts/setup-firestore.ts`
2. Check Firestore console for errors
3. Ensure credentials have write permissions
4. Try creating a document manually in console

---

## Collections Reference

For detailed field specifications, see:
- **FIRESTORE_SCHEMA.md** - Complete schema documentation
- **API_REFERENCE.md** - API endpoint examples

---

## Next Steps

1. ✅ Set up Firestore collections (done)
2. ⏳ Configure Firebase Authentication
3. ⏳ Set up frontend API integration
4. ⏳ Add camera/GPS capture
5. ⏳ End-to-end testing

---

## Quick Commands

```bash
# Initialize setup
npm install
npx ts-node scripts/setup-firestore.ts

# Start backend
npm run dev

# Run tests
npm test

# Check logs
tail -f ~/.firebase/logs/firestore.log

# Export data
gcloud firestore export gs://bucket/backup

# Monitor usage
gcloud firestore describe-database

# Delete all data (DESTRUCTIVE!)
# Use Firestore console, not CLI
```

---

## Support

For issues:
1. Check FIRESTORE_SCHEMA.md for field definitions
2. Review API_REFERENCE.md for endpoint examples
3. Check Firebase Console → Firestore → Usage dashboard
4. Review error logs in backend console

---

**Status:** ✅ Database setup ready for MVP

