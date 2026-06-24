import { Router } from 'express';
import Redis from 'ioredis';
import { QueueManager } from '../queues/queue-manager';
import Stripe from 'stripe';
import { QueueName } from '../queues/types';

/**
 * Health Check Endpoints
 * Provides observability into system status before and after deployment
 */
export function createHealthRoutes(
  redis: Redis,
  queueManager?: QueueManager,
  stripe?: Stripe
): Router {
  const router = Router();

  /**
   * GET /health or /health/status
   * Overall system health status
   * No authentication required
   */
  const healthHandler = async (req: any, res: any) => {
    try {
      const redisConnected = redis.status === 'ready';
      const status = redisConnected ? 'ok' : 'degraded';

      console.log('[HealthCheck] System health:', status);

      res.status(redisConnected ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        redis: redis.status,
        services: {
          redis: redis.status,
          queueManager: queueManager ? 'initialized' : 'not initialized',
          stripe: stripe ? 'initialized' : 'not initialized',
        },
      });
    } catch (error) {
      console.error('[HealthCheck] Health check error:', error);
      res.status(503).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  router.get('/', healthHandler);
  router.get('/status', healthHandler);

  /**
   * GET /health/queue
   * Queue status and job counts
   * Critical for deployment validation
   */
  router.get('/queue', async (req, res) => {
    try {
      if (!queueManager) {
        return res.status(503).json({
          error: 'Queue manager not initialized',
          status: 'unavailable',
        });
      }

      console.log('[HealthCheck] Checking queue status...');

      const queueStats = {};
      let totalWaiting = 0;
      let totalActive = 0;
      let totalFailed = 0;

      // Get stats for all queues
      for (const queueName of Object.values(QueueName)) {
        try {
          const queue = queueManager.getQueue(queueName);
          const counts = await queue.getJobCounts();

          (queueStats as any)[queueName] = {
            waiting: counts.waiting,
            active: counts.active,
            failed: counts.failed,
            completed: counts.completed,
            delayed: counts.delayed,
          };

          totalWaiting += counts.waiting;
          totalActive += counts.active;
          totalFailed += counts.failed;
        } catch (error) {
          console.error(`[HealthCheck] Error getting ${queueName} stats:`, error);
          (queueStats as any)[queueName] = { error: 'Failed to get stats' };
        }
      }

      const isHealthy = totalFailed < 10; // Alert if more than 10 failed jobs

      console.log('[HealthCheck] Queue stats retrieved:', { totalWaiting, totalActive, totalFailed });

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        redis: redis.status,
        queues: queueStats,
        summary: {
          totalWaiting,
          totalActive,
          totalFailed,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[HealthCheck] Queue health check error:', error);
      res.status(503).json({
        error: 'Failed to check queue status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health/redis
   * Redis connection status
   */
  router.get('/redis', async (req, res) => {
    try {
      console.log('[HealthCheck] Checking Redis connection...');

      const ping = await redis.ping();
      const info = await redis.info('server');

      const redisUp = ping === 'PONG';

      console.log('[HealthCheck] Redis:', redisUp ? 'connected' : 'disconnected');

      res.status(redisUp ? 200 : 503).json({
        status: redisUp ? 'connected' : 'disconnected',
        redis: redis.status,
        ping,
        info: info ? info.split('\r\n').slice(0, 10) : 'N/A', // First 10 lines of info
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[HealthCheck] Redis health check error:', error);
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        redis: redis.status,
      });
    }
  });

  /**
   * GET /health/stripe
   * Stripe API connectivity
   */
  router.get('/stripe', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({
          status: 'not_configured',
          message: 'Stripe not initialized',
        });
      }

      console.log('[HealthCheck] Checking Stripe connectivity...');

      // Make a simple API call to validate key
      const account = await (stripe.account.retrieve as any)();

      const stripeUp = !!account.id;

      console.log('[HealthCheck] Stripe:', stripeUp ? 'connected' : 'error');

      res.status(stripeUp ? 200 : 503).json({
        status: stripeUp ? 'connected' : 'error',
        accountId: account.id,
        accountType: account.type,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[HealthCheck] Stripe health check error:', error);
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health/deep
   * Comprehensive system check (for pre-deployment validation)
   */
  router.get('/deep', async (req, res) => {
    try {
      console.log('[HealthCheck] Running deep system check...');

      const checks: Record<string, Record<string, any>> = {
        redis: { status: 'checking' },
        queues: { status: 'checking' },
        stripe: { status: 'checking' },
      };

      // Check Redis
      try {
        const ping = await redis.ping();
        checks.redis = {
          status: ping === 'PONG' ? 'ok' : 'error',
          connection: redis.status,
        };
      } catch (error) {
        checks.redis = { status: 'error', error: String(error) };
      }

      // Check Queues
      try {
        if (queueManager) {
          const queue = queueManager.getQueue(QueueName.AI_VERIFICATION);
          const counts = await queue.getJobCounts();
          checks.queues = {
            status: 'ok',
            activeJobs: counts.active,
            waitingJobs: counts.waiting,
            failedJobs: counts.failed,
          };
        } else {
          checks.queues = { status: 'not_initialized' };
        }
      } catch (error) {
        checks.queues = { status: 'error', error: String(error) };
      }

      // Check Stripe
      try {
        if (stripe) {
          const account = await (stripe.account.retrieve as any)();
          checks.stripe = {
            status: account.charges_enabled ? 'ok' : 'warning',
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
          };
        } else {
          checks.stripe = { status: 'not_initialized' };
        }
      } catch (error) {
        checks.stripe = { status: 'error', error: String(error) };
      }

      const allOk = Object.values(checks).every(
        (check: any) => check.status === 'ok' || check.status === 'not_initialized'
      );

      console.log('[HealthCheck] Deep check complete:', allOk ? 'all_ok' : 'some_issues');

      res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ok' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
        recommendation: allOk ? 'System ready for deployment' : 'Address issues before deployment',
      });
    } catch (error) {
      console.error('[HealthCheck] Deep check error:', error);
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
