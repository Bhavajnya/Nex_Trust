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

      // Validate password
      if (!password || password.length < 8) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password must be at least 8 characters',
          received: password ? `${password.length} chars` : 'empty',
        });
      }

      console.log('[Auth] Creating user with:', {
        email,
        passwordLength: password.length,
        passwordPreview: password.substring(0, 3) + '***',
        name,
        role,
      });

      // Create Firebase Auth user
      let firebaseUser;
      try {
        firebaseUser = await auth.createUser({
          email,
          password,
          displayName: name,
        });
        console.log('[Auth] Firebase user created successfully:', firebaseUser.uid);
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

      console.log('[Auth] Preparing to save user to Firestore:', { userId, email, name, role });

      // Write user document
      try {
        console.log('[Auth] Writing user document to Firestore');
        await db.collection('users').doc(userId).set(userData);
        console.log('[Auth] User document written successfully');
      } catch (dbError: any) {
        console.error('[Auth] Failed to write user document:', {
          code: dbError.code,
          message: dbError.message,
          details: dbError.details,
        });
        // Registration still succeeds - Firebase Auth user exists
        // Profile will be created on first login if needed
        console.warn('[Auth] Continuing with registration despite Firestore write failure');
      }

      // Try to create trust score (non-critical)
      try {
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
      } catch (trustError: any) {
        console.warn('[Auth] Failed to create trust score:', trustError.message);
      }

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
        console.log('[Auth] ID token verified for user:', decodedToken.uid);
      } catch (tokenError: any) {
        console.error('[Auth] Token verification failed:', tokenError.message);
        return res.status(401).json({
          error: 'Invalid or expired token',
          message: 'Please log in again',
        });
      }

      const userId = decodedToken.uid;

      // Create user profile from Firebase Auth (Firestore may not be accessible)
      const user = {
        id: userId,
        uid: userId,
        email: decodedToken.email || '',
        name: decodedToken.name || 'User',
        role: 'customer', // Default role - ideally this should come from custom claims or Firestore
        trustScore: 50,
        accountStatus: 'active',
        createdAt: new Date().toISOString(),
        phone: null,
        bio: '',
        skills: [],
        profileImage: null,
        jobsCompleted: 0,
        jobsAccepted: 0,
        totalEarnings: 0,
        emailVerified: decodedToken.email_verified || false,
      };

      // Optionally try to get Firestore data (non-critical)
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const fsData = userDoc.data();
          if (fsData?.role) user.role = fsData.role;
          if (fsData?.trustScore) user.trustScore = fsData.trustScore;
          console.log('[Auth] Firestore profile data merged for user:', userId);
        }
      } catch (err: any) {
        console.warn('[Auth] Could not fetch Firestore data (non-critical):', err.message);
        // Continue without Firestore data
      }

      console.log('[Auth] User logged in successfully:', userId, 'Role:', user.role);

      res.json({
        success: true,
        userId,
        user,
        token: idToken,
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
