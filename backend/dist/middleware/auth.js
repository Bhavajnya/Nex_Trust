"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRole = void 0;
exports.createAuthMiddleware = createAuthMiddleware;
exports.requireRole = requireRole;
exports.requireResourceOwnership = requireResourceOwnership;
exports.requireIdempotencyKey = requireIdempotencyKey;
exports.requireSystemAuth = requireSystemAuth;
const firebase_admin_1 = require("firebase-admin");
var UserRole;
(function (UserRole) {
    UserRole["CUSTOMER"] = "customer";
    UserRole["WORKER"] = "worker";
    UserRole["ADMIN"] = "admin";
    UserRole["SYSTEM"] = "system";
})(UserRole || (exports.UserRole = UserRole = {}));
/**
 * Authentication middleware - verifies Firebase ID token
 */
function createAuthMiddleware(db) {
    return async (req, res, next) => {
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
            const decodedToken = await (0, firebase_admin_1.auth)().verifyIdToken(idToken);
            // Get user roles from Firestore
            const userRef = db.collection('users').doc(decodedToken.uid);
            const userDoc = await userRef.get();
            if (!userDoc.exists) {
                return res.status(401).json({
                    error: 'User not found in database',
                    code: 'USER_NOT_FOUND',
                });
            }
            const userData = userDoc.data();
            // Set authenticated user on request
            req.user = {
                uid: decodedToken.uid,
                email: userData.email || decodedToken.email || '',
                role: userData.role || UserRole.CUSTOMER,
                roles: userData.roles || [userData.role || UserRole.CUSTOMER],
            };
            // Extract idempotency key from headers
            req.idempotencyKey = req.headers['idempotency-key'];
            next();
        }
        catch (error) {
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
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED',
            });
        }
        const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
        if (!hasRole) {
            console.warn(`[RBAC] Access denied for user ${req.user.uid}. Required: ${allowedRoles}, Has: ${req.user.roles}`);
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
function requireResourceOwnership(db) {
    return async (req, res, next) => {
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
            const job = jobDoc.data();
            // Allow if user is customer, worker, or admin
            const isCustomer = job.buyerId === req.user.uid;
            const isWorker = job.freelancerId === req.user.uid;
            const isAdmin = req.user.roles.includes(UserRole.ADMIN);
            if (!isCustomer && !isWorker && !isAdmin) {
                console.warn(`[RBAC] Ownership check failed. User: ${req.user.uid}, Customer: ${job.buyerId}, Worker: ${job.freelancerId}`);
                return res.status(403).json({
                    error: 'You do not have access to this job',
                    code: 'NOT_RESOURCE_OWNER',
                });
            }
            // Attach job data to request for later use
            req.job = job;
            next();
        }
        catch (error) {
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
function requireIdempotencyKey(req, res, next) {
    if (!req.idempotencyKey) {
        return res.status(400).json({
            error: 'Idempotency-Key header required for financial operations',
            code: 'MISSING_IDEMPOTENCY_KEY',
        });
    }
    next();
}
/**
 * System-to-system authentication (for internal services like AI verification)
 */
function requireSystemAuth(req, res, next) {
    const systemKey = req.headers['x-system-key'];
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
