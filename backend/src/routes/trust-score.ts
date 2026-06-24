import { Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { TrustScoreService } from '../services/trust-score';
import { createAuthMiddleware, AuthenticatedRequest, UserRole } from '../middleware/auth';

export function createTrustScoreRoutes(db: Firestore): Router {
  const router = Router();
  const trustScoreService = new TrustScoreService(db);

  // Apply authentication middleware
  router.use(createAuthMiddleware(db));

  /**
   * GET /trust-score/:userId
   * Get trust score for a specific user
   * Public endpoint - any authenticated user can view any user's trust score
   */
  router.get('/:userId', async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          error: 'userId parameter is required',
        });
      }

      console.log('[TrustScoreRoute] Fetching trust score for user:', userId);

      const score = await trustScoreService.getTrustScore(userId);

      res.status(200).json({
        success: true,
        score,
        userId,
      });
    } catch (error) {
      console.error('[TrustScoreRoute] Error getting trust score:', error);
      res.status(500).json({
        error: 'Failed to get trust score',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /trust-score/:userId/full
   * Get full trust score data including metrics
   * Public endpoint - any authenticated user can view
   */
  router.get('/:userId/full', async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          error: 'userId parameter is required',
        });
      }

      console.log('[TrustScoreRoute] Fetching full trust score data for user:', userId);

      const doc = await db.collection('trustScores').doc(userId).get();

      if (!doc.exists) {
        // Calculate if not cached
        const trustData = await trustScoreService.calculateTrustScore(userId);
        return res.status(200).json({
          success: true,
          data: trustData,
        });
      }

      res.status(200).json({
        success: true,
        data: doc.data(),
      });
    } catch (error) {
      console.error('[TrustScoreRoute] Error getting full trust score:', error);
      res.status(500).json({
        error: 'Failed to get trust score data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /trust-score/:userId/recalculate
   * Manually recalculate trust score for a user (admin only)
   */
  router.post('/:userId/recalculate', async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;

      // Check if user is admin
      const isAdmin = req.user?.roles?.includes(UserRole.ADMIN);
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Only admins can recalculate trust scores',
        });
      }

      if (!userId) {
        return res.status(400).json({
          error: 'userId parameter is required',
        });
      }

      console.log('[TrustScoreRoute] Recalculating trust score for user:', userId);

      const trustData = await trustScoreService.calculateTrustScore(userId);

      res.status(200).json({
        success: true,
        message: 'Trust score recalculated',
        data: trustData,
      });
    } catch (error) {
      console.error('[TrustScoreRoute] Error recalculating trust score:', error);
      res.status(500).json({
        error: 'Failed to recalculate trust score',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /trust-score/leaderboard
   * Get leaderboard of top workers by trust score
   */
  router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 100);

      console.log('[TrustScoreRoute] Fetching leaderboard with limit:', limit);

      const leaderboard = await trustScoreService.getLeaderboard(limit);

      res.status(200).json({
        success: true,
        leaderboard,
        count: leaderboard.length,
      });
    } catch (error) {
      console.error('[TrustScoreRoute] Error getting leaderboard:', error);
      res.status(500).json({
        error: 'Failed to get leaderboard',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
