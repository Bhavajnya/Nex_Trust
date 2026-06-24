import { Router, Request, Response } from 'express';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { Auth } from 'firebase-admin/auth';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * Authentication Routes - Firebase Auth Integration
 * POST /api/auth/register - Create new user account
 * POST /api/auth/login - Login with email/password (via Firebase client)
 * POST /api/auth/logout - Logout (client-side, but can track sessions)
 * GET /api/auth/me - Get current user profile
 * PUT /api/auth/profile - Update user profile
 */

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  role: z.enum(['customer', 'worker']),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
  skills: z.array(z.string()).optional(),
  profileImage: z.string().url().optional(),
});

export function createAuthRoutes(db: Firestore, auth: Auth): Router {
  const router = Router();

  /**
   * POST /api/auth/register
   * Register new user with Firebase Auth
   * Backend: Create user record in Firestore
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const validation = registerSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: validation.error.issues,
        });
      }

      const { email, password, name, role } = validation.data;

      // Create Firebase Auth user
      let firebaseUser;
      try {
        firebaseUser = await auth.createUser({
          email,
          password,
          displayName: name,
        });
      } catch (authError: any) {
        // Handle specific Firebase Auth errors
        if (authError.code === 'auth/email-already-exists') {
          return res.status(400).json({
            error: 'Email already registered',
          });
        }
        if (authError.code === 'auth/invalid-email') {
          return res.status(400).json({
            error: 'Invalid email address',
          });
        }
        if (authError.code === 'auth/invalid-password') {
          return res.status(400).json({
            error: 'Password must be at least 8 characters',
          });
        }
        throw authError;
      }

      const userId = firebaseUser.uid;
      const now = Timestamp.now();

      // Create user record in Firestore
      const userData = {
        id: userId,
        uid: userId,
        email,
        name,
        role, // 'customer' or 'worker'
        phone: null,
        bio: '',
        skills: [],
        profileImage: null,
        trustScore: 50, // Default trust score for new users
        jobsCompleted: 0,
        jobsAccepted: 0,
        totalEarnings: 0,
        accountStatus: 'active',
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      };

      await db.collection('users').doc(userId).set(userData);

      // Create initial trust score record
      await db.collection('trustScores').doc(userId).set({
        userId,
        score: 50,
        jobsCompleted: 0,
        jobsAccepted: 0,
        disputeCount: 0,
        disputesWon: 0,
        verificationSuccessRate: 1.0,
        averageRating: 5.0,
        lastUpdated: now,
      });

      console.log('[Auth] New user registered:', userId, 'Email:', email, 'Role:', role);

      res.status(201).json({
        success: true,
        userId,
        user: userData,
        message: 'User registered successfully. Please log in with your credentials.',
      });
    } catch (error) {
      console.error('[Auth] Registration error:', error);
      res.status(500).json({
        error: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/auth/login
   * Verify Firebase ID token and return user data
   * Client sends token from Firebase client SDK
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({
          error: 'Missing ID token',
          message: 'Please provide Firebase ID token from client authentication',
        });
      }

      // Verify token with Firebase
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(idToken);
      } catch (tokenError: any) {
        return res.status(401).json({
          error: 'Invalid or expired token',
          message: 'Please log in again',
        });
      }

      const userId = decodedToken.uid;

      // Get user data from Firestore
      const userDoc = await db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User exists in Firebase but not in database',
        });
      }

      const user = { id: userDoc.id, ...userDoc.data() };

      // Get trust score
      const trustScoreDoc = await db.collection('trustScores').doc(userId).get();
      const trustScore = trustScoreDoc.exists ? trustScoreDoc.data()?.score || 50 : 50;

      console.log('[Auth] User logged in:', userId);

      res.json({
        success: true,
        userId,
        user: {
          ...user,
          trustScore,
        },
        token: idToken, // Return token for frontend use
        message: 'Login successful',
      });
    } catch (error) {
      console.error('[Auth] Login error:', error);
      res.status(500).json({
        error: 'Login failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user profile (requires auth middleware)
   */
  router.get('/me', async (req: any, res: Response) => {
    try {
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const userDoc = await db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      const user = { id: userDoc.id, ...userDoc.data() };

      // Get trust score
      const trustScoreDoc = await db.collection('trustScores').doc(userId).get();
      const trustScore = trustScoreDoc.exists ? trustScoreDoc.data()?.score || 50 : 50;

      res.json({
        success: true,
        user: {
          ...user,
          trustScore,
        },
      });
    } catch (error) {
      console.error('[Auth] Get profile error:', error);
      res.status(500).json({
        error: 'Failed to fetch profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PUT /api/auth/profile
   * Update user profile (requires auth middleware)
   */
  router.put('/profile', async (req: any, res: Response) => {
    try {
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const validation = updateProfileSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: validation.error.issues,
        });
      }

      const updateData = validation.data;

      // Check user exists
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      // Update Firestore
      const now = Timestamp.now();
      await db.collection('users').doc(userId).update({
        ...updateData,
        updatedAt: now,
      });

      // Get updated user
      const updatedDoc = await db.collection('users').doc(userId).get();
      const updatedUser = { id: updatedDoc.id, ...updatedDoc.data() };

      console.log('[Auth] User profile updated:', userId);

      res.json({
        success: true,
        user: updatedUser,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      console.error('[Auth] Update profile error:', error);
      res.status(500).json({
        error: 'Failed to update profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Track logout (token invalidation is handled by Firebase client)
   */
  router.post('/logout', async (req: any, res: Response) => {
    try {
      const userId = req.user?.uid;

      if (userId) {
        console.log('[Auth] User logged out:', userId);
      }

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      res.status(500).json({
        error: 'Logout failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/auth/verify-token
   * Verify if a token is still valid
   */
  router.post('/verify-token', async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({
          error: 'Missing ID token',
        });
      }

      try {
        const decodedToken = await auth.verifyIdToken(idToken);

        res.json({
          success: true,
          valid: true,
          userId: decodedToken.uid,
        });
      } catch (error) {
        res.json({
          success: true,
          valid: false,
          message: 'Token is invalid or expired',
        });
      }
    } catch (error) {
      console.error('[Auth] Token verification error:', error);
      res.status(500).json({
        error: 'Token verification failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
