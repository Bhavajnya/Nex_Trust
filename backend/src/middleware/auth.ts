import { Request, Response, NextFunction } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export enum UserRole {
  CUSTOMER = 'customer',
  WORKER = 'worker',
  ADMIN = 'admin',
  SYSTEM = 'system', // For AI/automated services
}

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: UserRole;
    roles: UserRole[];
  };
  idempotencyKey?: string;
}

/**
 * Authentication middleware - verifies Firebase ID token
 */
export function createAuthMiddleware(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing or invalid authorization header',
          code: 'AUTH_MISSING',
        });
      }

      const idToken = authHeader.substring(7);

      // Verify Firebase ID token
      const decodedToken = await getAuth().verifyIdToken(idToken);

      // Get user roles from Firestore
      const userRef = db.collection('users').doc(decodedToken.uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return res.status(401).json({
          error: 'User not found in database',
          code: 'USER_NOT_FOUND',
        });
      }

      const userData = userDoc.data() as {
        email: string;
        role?: UserRole;
        roles?: UserRole[];
      };

      // Set authenticated user on request
      req.user = {
        uid: decodedToken.uid,
        email: userData.email || decodedToken.email || '',
        role: userData.role || UserRole.CUSTOMER,
        roles: userData.roles || [userData.role || UserRole.CUSTOMER],
      };

      // Extract idempotency key from headers
      req.idempotencyKey = req.headers['idempotency-key'] as string;

      next();
    } catch (error) {
      console.error('[Auth] Verification failed:', error);
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }
  };
}

/**
 * Role-based access control middleware
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      console.warn(
        `[RBAC] Access denied for user ${req.user.uid}. Required: ${allowedRoles}, Has: ${req.user.roles}`
      );
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: req.user.roles,
      });
    }

    next();
  };
}

/**
 * Verify user is the resource owner (customer or worker for the job)
 */
export function requireResourceOwnership(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const jobId = req.params.jobId || req.body.jobId;

      if (!jobId) {
        return res.status(400).json({
          error: 'Job ID required',
          code: 'MISSING_JOB_ID',
        });
      }

      // Get job details
      const jobDoc = await db.collection('jobs').doc(jobId).get();

      if (!jobDoc.exists) {
        return res.status(404).json({
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      const job = jobDoc.data() as {
        buyerId: string;
        freelancerId?: string;
      };

      // Allow if user is customer, worker, or admin
      const isCustomer = job.buyerId === req.user.uid;
      const isWorker = job.freelancerId === req.user.uid;
      const isAdmin = req.user.roles.includes(UserRole.ADMIN);

      if (!isCustomer && !isWorker && !isAdmin) {
        console.warn(
          `[RBAC] Ownership check failed. User: ${req.user.uid}, Customer: ${job.buyerId}, Worker: ${job.freelancerId}`
        );
        return res.status(403).json({
          error: 'You do not have access to this job',
          code: 'NOT_RESOURCE_OWNER',
        });
      }

      // Attach job data to request for later use
      (req as any).job = job;

      next();
    } catch (error) {
      console.error('[RBAC] Ownership check error:', error);
      return res.status(500).json({
        error: 'Authorization check failed',
        code: 'AUTH_CHECK_ERROR',
      });
    }
  };
}

/**
 * Require idempotency key for money operations
 */
export function requireIdempotencyKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  if (!idempotencyKey) {
    console.warn('[Idempotency] Missing idempotency key for:', req.method, req.path);
    return res.status(400).json({
      error: 'Idempotency-Key header required for financial operations',
      code: 'MISSING_IDEMPOTENCY_KEY',
      hint: 'Add Idempotency-Key header to prevent duplicate submissions',
    });
  }

  // Store in request for logging
  req.idempotencyKey = idempotencyKey;
  
  console.log('[Idempotency] Valid key for:', req.method, req.path, 'key:', idempotencyKey.substring(0, 8) + '...');

  next();
}

/**
 * System-to-system authentication (for internal services like AI verification)
 */
export function requireSystemAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const systemKey = req.headers['x-system-key'] as string;
  const expectedKey = process.env.SYSTEM_AUTH_KEY;

  if (!systemKey || !expectedKey || systemKey !== expectedKey) {
    console.warn('[SystemAuth] Invalid system key');
    return res.status(401).json({
      error: 'Invalid system authentication',
      code: 'INVALID_SYSTEM_KEY',
    });
  }

  // Mark as system user
  req.user = {
    uid: 'system',
    email: 'system@magichandshake.com',
    role: UserRole.SYSTEM,
    roles: [UserRole.SYSTEM],
  };

  next();
}
