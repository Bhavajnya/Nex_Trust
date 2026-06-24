"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustScoreService = void 0;
const firestore_1 = require("firebase-admin/firestore");
/**
 * Trust Score Service - Calculates user reputation
 * Core of Magic Handshake reputation system
 * Factors:
 * - Jobs completed (positive)
 * - Disputes initiated/lost (negative)
 * - Evidence verification success rate (positive)
 * - User ratings (positive/negative)
 */
class TrustScoreService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Calculate trust score for a user
     * Score ranges from 0-100
     */
    async calculateTrustScore(userId) {
        try {
            const userDoc = await this.db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                throw new Error(`User not found: ${userId}`);
            }
            // Fetch user metrics
            const jobsSnapshot = await this.db
                .collection('jobs')
                .where('workerId', '==', userId)
                .where('state', '==', 'RELEASED')
                .get();
            const jobsCompleted = jobsSnapshot.size;
            const acceptedSnapshot = await this.db
                .collection('jobs')
                .where('workerId', '==', userId)
                .get();
            const jobsAccepted = acceptedSnapshot.size;
            const disputesSnapshot = await this.db
                .collection('disputes')
                .where('workerId', '==', userId)
                .get();
            const disputeCount = disputesSnapshot.size;
            const disputesWonSnapshot = await this.db
                .collection('disputes')
                .where('workerId', '==', userId)
                .where('resolution', '==', 'WORKER_WIN')
                .get();
            const disputesWon = disputesWonSnapshot.size;
            // Calculate verification success rate
            const evidenceSnapshot = await this.db
                .collection('evidence')
                .where('uploadedBy', '==', userId)
                .get();
            let verificationSuccessRate = 1.0;
            if (evidenceSnapshot.size > 0) {
                const approvedCount = evidenceSnapshot.docs.filter((doc) => doc.data().verificationStatus === 'approved').length;
                verificationSuccessRate = approvedCount / evidenceSnapshot.size;
            }
            // Get average rating from reviews/ratings
            let averageRating = 5.0;
            try {
                const ratingsSnapshot = await this.db
                    .collection('ratings')
                    .where('recipientId', '==', userId)
                    .get();
                if (ratingsSnapshot.size > 0) {
                    const totalRating = ratingsSnapshot.docs.reduce((sum, doc) => {
                        return sum + (doc.data().rating || 0);
                    }, 0);
                    averageRating = totalRating / ratingsSnapshot.size;
                }
            }
            catch (err) {
                console.warn('[TrustScore] No ratings found for user:', userId);
            }
            // Calculate final score
            const score = this.computeScore({
                jobsCompleted,
                jobsAccepted,
                disputeCount,
                disputesWon,
                verificationSuccessRate,
                averageRating,
            });
            const trustData = {
                userId,
                score,
                jobsCompleted,
                jobsAccepted,
                disputeCount,
                disputesWon,
                verificationSuccessRate,
                averageRating,
                lastUpdated: firestore_1.Timestamp.now(),
            };
            // Save to trustScores collection
            await this.db.collection('trustScores').doc(userId).set(trustData, { merge: true });
            console.log('[TrustScore] Calculated score for user:', userId, 'Score:', score);
            return trustData;
        }
        catch (err) {
            console.error('[TrustScore] Error calculating score:', err);
            throw err;
        }
    }
    /**
     * Compute final trust score from metrics
     * Weighted formula:
     * - 30% from completion rate
     * - 25% from verification success
     * - 20% from dispute history
     * - 25% from ratings
     */
    computeScore(metrics) {
        // Completion rate: 0-100
        const completionRate = metrics.jobsAccepted > 0 ? (metrics.jobsCompleted / metrics.jobsAccepted) * 100 : 0;
        // Dispute ratio: penalize users with high dispute rates
        const disputeRatio = Math.min(1, metrics.disputeCount / Math.max(1, metrics.jobsCompleted + 1));
        const disputePenalty = disputeRatio * 30; // Up to 30 point penalty
        // Dispute win rate: higher wins = higher trust
        const disputeWinRate = metrics.disputeCount > 0 ? metrics.disputesWon / metrics.disputeCount : 1.0;
        // Rating factor: 0-100 based on average rating (5 stars = 100)
        const ratingFactor = (metrics.averageRating / 5) * 100;
        // Weighted formula
        const score = completionRate * 0.3 +
            metrics.verificationSuccessRate * 100 * 0.25 +
            disputeWinRate * 100 * 0.2 +
            ratingFactor * 0.25 -
            disputePenalty;
        // Ensure score is between 0-100
        return Math.max(0, Math.min(100, score));
    }
    /**
     * Get trust score for user
     */
    async getTrustScore(userId) {
        try {
            const doc = await this.db.collection('trustScores').doc(userId).get();
            if (doc.exists) {
                return doc.data()?.score || 50; // Default to 50 if not set
            }
            // Calculate if not cached
            const trustData = await this.calculateTrustScore(userId);
            return trustData.score;
        }
        catch (err) {
            console.error('[TrustScore] Error getting trust score:', err);
            return 50; // Default neutral score on error
        }
    }
    /**
     * Bulk recalculate trust scores
     * For admin/cron jobs
     */
    async recalculateAllScores() {
        try {
            const usersSnapshot = await this.db.collection('users').get();
            for (const userDoc of usersSnapshot.docs) {
                await this.calculateTrustScore(userDoc.id);
            }
            console.log('[TrustScore] Recalculated all trust scores');
        }
        catch (err) {
            console.error('[TrustScore] Error recalculating scores:', err);
        }
    }
    /**
     * Get leaderboard of top workers by trust score
     */
    async getLeaderboard(limit = 10) {
        try {
            const snapshot = await this.db
                .collection('trustScores')
                .orderBy('score', 'desc')
                .limit(limit)
                .get();
            return snapshot.docs.map((doc) => doc.data());
        }
        catch (err) {
            console.error('[TrustScore] Error fetching leaderboard:', err);
            return [];
        }
    }
}
exports.TrustScoreService = TrustScoreService;
