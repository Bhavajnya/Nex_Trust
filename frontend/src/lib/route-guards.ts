/**
 * Route Guard Utilities for Client-Side Authorization
 * Provides role-based access control and authentication checks
 * Note: Backend always enforces authorization; these are UX guards only
 */

export enum UserRole {
  CUSTOMER = 'customer',
  WORKER = 'worker',
  ADMIN = 'admin',
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string | undefined, requiredRole: UserRole | UserRole[]): boolean {
  if (!userRole) return false;
  
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(userRole as UserRole);
  }
  
  return userRole === requiredRole;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(user: any): boolean {
  return !!user?.uid && !!user?.email;
}

/**
 * Route guard configuration
 */
export interface RouteGuard {
  requireAuth: boolean;
  requireRole?: UserRole | UserRole[];
  redirectTo?: string;
}

/**
 * Protected route configurations
 */
export const PROTECTED_ROUTES: Record<string, RouteGuard> = {
  '/dashboard/worker': {
    requireAuth: true,
    requireRole: UserRole.WORKER,
    redirectTo: '/sign-in',
  },
  '/dashboard/customer': {
    requireAuth: true,
    requireRole: UserRole.CUSTOMER,
    redirectTo: '/sign-in',
  },
  '/post-job': {
    requireAuth: true,
    requireRole: UserRole.CUSTOMER,
    redirectTo: '/sign-in',
  },
  '/disputes': {
    requireAuth: true,
    requireRole: [UserRole.CUSTOMER, UserRole.WORKER],
    redirectTo: '/sign-in',
  },
  '/job/:id': {
    requireAuth: true,
    redirectTo: '/sign-in',
  },
};

/**
 * Get route guard for a path
 */
export function getRouteGuard(pathname: string): RouteGuard | null {
  // Check exact match first
  if (PROTECTED_ROUTES[pathname]) {
    return PROTECTED_ROUTES[pathname];
  }

  // Check pattern match (e.g., /job/:id)
  for (const [pattern, guard] of Object.entries(PROTECTED_ROUTES)) {
    if (pattern.includes(':')) {
      const regex = new RegExp('^' + pattern.replace('/:id', '/[^/]+') + '$');
      if (regex.test(pathname)) {
        return guard;
      }
    }
  }

  return null;
}

/**
 * Validate access to a route
 */
export function validateRouteAccess(
  pathname: string,
  user: any,
  userRole: string | undefined
): { allowed: boolean; redirectTo?: string } {
  const guard = getRouteGuard(pathname);

  if (!guard) {
    // No guard configured, allow access
    return { allowed: true };
  }

  if (guard.requireAuth && !isAuthenticated(user)) {
    return {
      allowed: false,
      redirectTo: guard.redirectTo || '/sign-in',
    };
  }

  if (guard.requireRole && !hasRole(userRole, guard.requireRole)) {
    return {
      allowed: false,
      redirectTo: '/dashboard/customer', // Default redirect for unauthorized
    };
  }

  return { allowed: true };
}

/**
 * Log access attempt for debugging
 */
export function logAccessAttempt(
  pathname: string,
  user: any,
  userRole: string | undefined,
  allowed: boolean
): void {
  const timestamp = new Date().toISOString();
  const userId = user?.uid || 'anonymous';
  const role = userRole || 'none';

  console.log(`[v0] Route access [${timestamp}] ${pathname} - User: ${userId} (${role}) - ${allowed ? 'ALLOWED' : 'DENIED'}`);
}
