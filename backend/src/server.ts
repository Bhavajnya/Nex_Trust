import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { config, validateConfig } from './config';
import { initializeFirebase } from './firebase';
import { createPaymentRoutes } from './routes/payments';
import { createEscrowRoutes } from './routes/escrow';
import { createReconciliationRoutes } from './routes/reconciliation';
import { createEvidenceRoutes } from './routes/evidence';
import { createDisputeRoutes } from './routes/disputes';
import { createJobRoutes } from './routes/jobs';
import { createAuthRoutes } from './routes/auth';
import { createTrustScoreRoutes } from './routes/trust-score';
import { createHealthRoutes } from './routes/health';
import { getAuth } from 'firebase-admin/auth';
import { createAuthMiddleware } from './middleware/auth';
import { ReconciliationWorker } from './workers/reconciliation-worker';
import { IdempotencyCleanupWorker } from './workers/idempotency-cleanup-worker';
import stateMachineRoutes from './routes/state-machine';
import { TransactionManager } from './services/transaction-manager';
import { QueueManager } from './queues/queue-manager';

async function startServer() {
  validateConfig();

  // Initialize Firebase
  const db = initializeFirebase();
  const auth = getAuth();

  // Initialize Stripe
  const stripe = new Stripe(config.stripeSecretKey);

  // Initialize Redis with BullMQ-compatible settings
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: () => null, // Don't auto-retry to fail fast
    enableReadyCheck: false,
    enableOfflineQueue: false,
    lazyConnect: true, // Don't connect immediately
  });

  redis.on('error', (err: any) => {
    // Suppress connection refused errors in development to reduce log noise
    const isConnRefused = err.code === 'ECONNREFUSED' || 
                         err.message?.includes('ECONNREFUSED') ||
                         (err.name === 'AggregateError' && Array.isArray(err.errors) && 
                          err.errors.some((e: any) => e.code === 'ECONNREFUSED'));

    if (!isConnRefused) {
      console.error('[Redis] Error:', err);
    }
  });
  redis.on('connect', () => console.log('[Redis] Connected'));

  // Try to connect but don't wait
  redis.connect().catch(() => {
    console.warn('[Redis] Connection failed - workers will be disabled');
  });

  // Initialize Queue Manager
  const queueManager = new QueueManager(config.redisUrl);
  await queueManager.initialize();

  // Initialize Transaction Manager (handles atomic money flows)
  const transactionManager = new TransactionManager(db);

  // Create Express app
  const app = express();

  // Middleware
  const corsOrigins = Array.isArray(config.corsOrigin)
    ? config.corsOrigin
    : [config.corsOrigin];

  const corsOptions = {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-User-ID'],
  };
  app.use(cors(corsOptions));
  console.log('[Server] CORS configured for origins:', corsOrigins);
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Health check routes (no auth required)
  app.use('/health', createHealthRoutes(redis, queueManager, stripe));

  // Routes
  app.use('/api/auth', createAuthRoutes(db, auth));
  
  // Protected routes (require Firebase auth)
  const authMiddleware = createAuthMiddleware(db);
  app.use('/api/jobs', authMiddleware, createJobRoutes(db));
  app.use('/api/payments', authMiddleware, createPaymentRoutes(db, stripe, transactionManager));
  app.use('/api/escrow', authMiddleware, createEscrowRoutes(db));
  app.use('/api/evidence', authMiddleware, createEvidenceRoutes(db, queueManager));
  app.use('/api/disputes', authMiddleware, createDisputeRoutes(db, transactionManager));
  app.use('/api/trust-score', authMiddleware, createTrustScoreRoutes(db));
  app.use('/api/state-machine', authMiddleware, stateMachineRoutes);

  // Initialize workers (optional - only if Redis is available)
  let reconciliationWorker: any = null;
  let idempotencyCleanupWorker: any = null;

  if (queueManager.isReady()) {
    try {
      reconciliationWorker = new ReconciliationWorker(redis, db, stripe);
      idempotencyCleanupWorker = new IdempotencyCleanupWorker(redis, db);
      console.log('[Server] Background workers initialized');
    } catch (err: any) {
      console.warn('[Server] Failed to initialize workers:', err.message);
    }
  } else {
    console.warn('[Server] Skipping background workers (Redis not configured for development)');
    console.info('[Server] To enable: Install Redis and set REDIS_URL env var, or use Docker');
    console.info('[Server] Docker: docker run -d -p 6379:6379 redis:latest');
  }

  // Reconciliation routes (depends on worker)
  if (reconciliationWorker) {
    app.use(
      '/api/reconciliation',
      createReconciliationRoutes(db, stripe, redis, reconciliationWorker)
    );
  } else {
    console.log('[Server] Reconciliation routes disabled (no Redis)');
  }
  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Server] Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Unknown error',
    });
  });

  // Start server
  const server = app.listen(config.port, () => {
    console.log(`\n[Server] Magic Handshake Backend`);
    console.log(`[Server] Running on port ${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] API URL: ${config.apiUrl}\n`);
  });

  server.on('error', (err: any) => {
    console.error('[Server] Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${config.port} is already in use`);
    }
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}, shutting down...`);

    server.close(async () => {
      console.log('[Server] HTTP server closed');

      try {
        if (reconciliationWorker) await reconciliationWorker.close();
        if (idempotencyCleanupWorker) await idempotencyCleanupWorker.close();
        console.log('[Server] Workers closed');
      } catch (err) {
        console.error('[Server] Error closing workers:', err);
      }

      try {
        await queueManager.shutdown();
        console.log('[Server] Queue manager closed');
      } catch (err) {
        console.error('[Server] Error closing queue manager:', err);
      }

      try {
        await redis.quit();
        console.log('[Server] Redis connection closed');
      } catch (err) {
        console.error('[Server] Error closing Redis:', err);
      }

      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start
startServer().catch((error) => {
  console.error('[Server] Startup failed:', error);
  process.exit(1);
});

// Keep process alive
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection:', reason);
});
