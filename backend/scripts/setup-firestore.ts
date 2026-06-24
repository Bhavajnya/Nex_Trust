/**
 * Firestore Database Setup Script
 * 
 * This script initializes all Firestore collections and indexes for Magic Handshake MVP.
 * Run this once to set up the database structure.
 * 
 * Usage:
 *   npx ts-node scripts/setup-firestore.ts
 * 
 * Prerequisites:
 *   - Firebase project created
 *   - Firestore database enabled
 *   - Firebase credentials configured
 *   - Node.js installed
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.join(__dirname, '../../firebase-credentials.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Firebase credentials not found at:', serviceAccountPath);
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS environment variable or place credentials.json in backend root');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

/**
 * Create test data to initialize collections
 */
async function setupFirestore() {
  console.log('🚀 Starting Firestore setup...\n');

  try {
    // ========== 1. Users Collection ==========
    console.log('📝 Setting up Users collection...');
    const testUserId = 'test-user-001';
    const testWorkerId = 'test-worker-001';
    const now = Timestamp.now();

    await db.collection('users').doc(testUserId).set({
      id: testUserId,
      uid: testUserId,
      email: 'customer@example.com',
      name: 'John Customer',
      role: 'customer',
      phone: '+1-555-0100',
      bio: 'Looking for quality work',
      skills: [],
      profileImage: null,
      trustScore: 50,
      jobsCompleted: 0,
      jobsAccepted: 0,
      totalEarnings: 0,
      accountStatus: 'active',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('users').doc(testWorkerId).set({
      id: testWorkerId,
      uid: testWorkerId,
      email: 'worker@example.com',
      name: 'Jane Worker',
      role: 'worker',
      phone: '+1-555-0101',
      bio: 'Expert web developer with 5 years experience',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      profileImage: null,
      trustScore: 85,
      jobsCompleted: 42,
      jobsAccepted: 50,
      totalEarnings: 12500,
      accountStatus: 'active',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    console.log('✅ Users collection initialized\n');

    // ========== 2. Trust Scores Collection ==========
    console.log('📝 Setting up Trust Scores collection...');

    await db.collection('trustScores').doc(testUserId).set({
      userId: testUserId,
      score: 50,
      jobsCompleted: 0,
      jobsAccepted: 0,
      disputeCount: 0,
      disputesWon: 0,
      verificationSuccessRate: 1.0,
      averageRating: 5.0,
      lastUpdated: now,
    });

    await db.collection('trustScores').doc(testWorkerId).set({
      userId: testWorkerId,
      score: 85,
      jobsCompleted: 42,
      jobsAccepted: 50,
      disputeCount: 2,
      disputesWon: 1,
      verificationSuccessRate: 0.98,
      averageRating: 4.8,
      lastUpdated: now,
    });

    console.log('✅ Trust Scores collection initialized\n');

    // ========== 3. Jobs Collection ==========
    console.log('📝 Setting up Jobs collection...');

    const testJobId = 'test-job-001';
    await db.collection('jobs').doc(testJobId).set({
      id: testJobId,
      jobId: testJobId,
      buyerId: testUserId,
      workerId: null,
      title: 'Fix website login bug',
      description: 'Mobile login page is not working properly. Need to debug and fix authentication issue.',
      requiredSkills: ['React', 'TypeScript', 'Firebase'],
      budget: 500,
      currency: 'USD',
      state: 'CREATED',
      status: 'active',
      verificationStatus: 'pending',
      deadline: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
      acceptedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      paymentRecordId: null,
      escrowRecordId: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    console.log('✅ Jobs collection initialized\n');

    // ========== 4. Evidence Collection ==========
    console.log('📝 Setting up Evidence collection...');

    const testEvidenceId = 'test-evidence-001';
    await db.collection('evidence').doc(testEvidenceId).set({
      id: testEvidenceId,
      jobId: testJobId,
      uploadedBy: testWorkerId,
      imageUrl: 'https://example.com/evidence-placeholder.jpg',
      imageHash: 'sha256_hash_placeholder',
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 8.5,
      verificationStatus: 'pending',
      aiVerificationScore: null,
      aiAnalysis: null,
      metadata: {},
      timestamp: now,
      createdAt: now,
    });

    console.log('✅ Evidence collection initialized\n');

    // ========== 5. Disputes Collection ==========
    console.log('📝 Setting up Disputes collection...');

    const testDisputeId = 'test-dispute-001';
    await db.collection('disputes').doc(testDisputeId).set({
      id: testDisputeId,
      jobId: testJobId,
      initiatorId: testUserId,
      buyerId: testUserId,
      workerId: testWorkerId,
      reason: 'Work quality does not match requirements',
      description: 'The work completed does not meet the specified requirements.',
      evidenceIds: [],
      status: 'open',
      resolution: null,
      resolvedBy: null,
      resolutionNotes: null,
      createdAt: now,
      resolvedAt: null,
    });

    console.log('✅ Disputes collection initialized\n');

    // ========== 6. Payments Collection ==========
    console.log('📝 Setting up Payments collection...');

    const testPaymentId = 'test-payment-001';
    await db.collection('payments').doc(testPaymentId).set({
      id: testPaymentId,
      jobId: testJobId,
      buyerId: testUserId,
      workerId: testWorkerId,
      amount: 500,
      currency: 'USD',
      status: 'pending',
      stripePaymentIntentId: null,
      stripeChargeId: null,
      idempotencyKey: `idempotency_${Date.now()}`,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    console.log('✅ Payments collection initialized\n');

    // ========== 7. Escrow Collection ==========
    console.log('📝 Setting up Escrow collection...');

    const testEscrowId = 'test-escrow-001';
    await db.collection('escrow').doc(testEscrowId).set({
      id: testEscrowId,
      jobId: testJobId,
      paymentRecordId: testPaymentId,
      buyerId: testUserId,
      workerId: testWorkerId,
      amount: 500,
      currency: 'USD',
      status: 'held',
      blockchainTxHash: null,
      contractAddress: null,
      idempotencyKey: `idempotency_escrow_${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    });

    console.log('✅ Escrow collection initialized\n');

    // ========== 8. Ratings Collection ==========
    console.log('📝 Setting up Ratings collection...');

    const testRatingId = 'test-rating-001';
    await db.collection('ratings').doc(testRatingId).set({
      id: testRatingId,
      recipientId: testWorkerId,
      authorId: testUserId,
      jobId: testJobId,
      rating: 5,
      review: 'Excellent work, very professional!',
      createdAt: now,
    });

    console.log('✅ Ratings collection initialized\n');

    // ========== 9. Notifications Collection ==========
    console.log('📝 Setting up Notifications collection...');

    const testNotificationId = 'test-notification-001';
    await db.collection('notifications').doc(testNotificationId).set({
      id: testNotificationId,
      userId: testUserId,
      type: 'job_created',
      title: 'Job Posted Successfully',
      message: 'Your job "Fix website login bug" has been posted and is visible to workers.',
      relatedId: testJobId,
      read: false,
      readAt: null,
      createdAt: now,
    });

    console.log('✅ Notifications collection initialized\n');

    // ========== 10. Idempotency Keys Collection ==========
    console.log('📝 Setting up Idempotency Keys collection...');

    const testIdempotencyKeyId = `test-key-${Date.now()}`;
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours

    await db.collection('idempotencyKeys').doc(testIdempotencyKeyId).set({
      key: testIdempotencyKeyId,
      requestHash: 'hash_placeholder',
      result: { success: true },
      createdAt: now,
      expiresAt,
    });

    console.log('✅ Idempotency Keys collection initialized\n');

    // ========== Summary ==========
    console.log('✨ ========== SETUP COMPLETE ========== ✨\n');
    console.log('✅ All collections initialized with test data');
    console.log('\n📊 Collections Created:');
    console.log('   1. users (2 test users)');
    console.log('   2. trustScores (2 test scores)');
    console.log('   3. jobs (1 test job)');
    console.log('   4. evidence (1 test evidence)');
    console.log('   5. disputes (1 test dispute)');
    console.log('   6. payments (1 test payment)');
    console.log('   7. escrow (1 test escrow)');
    console.log('   8. ratings (1 test rating)');
    console.log('   9. notifications (1 test notification)');
    console.log('  10. idempotencyKeys (1 test key)');

    console.log('\n📝 Test Data:');
    console.log('   Customer: john-customer@example.com');
    console.log('   Worker: jane-worker@example.com');
    console.log('   Job: "Fix website login bug" ($500)');

    console.log('\n⚠️  Next Steps:');
    console.log('   1. Set up Firestore security rules (see FIRESTORE_SCHEMA.md)');
    console.log('   2. Create composite indexes in Firebase Console');
    console.log('   3. Test API endpoints with curl or Postman');
    console.log('   4. Check API_REFERENCE.md for endpoint examples');

    console.log('\n🔒 Security Rules:');
    console.log('   Visit: https://console.firebase.google.com/project/YOUR_PROJECT/firestore/rules');
    console.log('   Copy rules from FIRESTORE_SCHEMA.md');

    console.log('\n📑 Composite Indexes:');
    console.log('   See FIRESTORE_SCHEMA.md for required indexes');
    console.log('   Create them in Firebase Console > Firestore > Indexes');

    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup
setupFirestore();
