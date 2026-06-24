import { Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import multer from 'multer';
import { EvidenceService } from '../services/evidence';
import { QueueManager } from '../queues/queue-manager';
import { QueueName } from '../queues/types';
import { EvidenceStatus } from '../types/index';
import {
  createAuthMiddleware,
  requireRole,
  requireResourceOwnership,
  UserRole,
  AuthenticatedRequest,
} from '../middleware/auth';

// Configure multer for in-memory file uploads (no disk storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME types
    const validTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf', 'text/plain'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export function createEvidenceRoutes(db: Firestore, queueManager?: QueueManager): Router {
  const router = Router();
  const evidenceService = new EvidenceService(db);

  // Apply authentication middleware
  router.use(createAuthMiddleware(db));

  /**
   * POST /evidence/upload
   * Upload evidence for a job using multipart/form-data
   * Worker Dashboard calls this with file stream
   */
  router.post(
    '/upload',
    requireRole(UserRole.WORKER),
    requireResourceOwnership(db),
    upload.single('file'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            error: 'No file provided',
            message: 'Please upload a file',
          });
        }

        const { jobId, latitude, longitude, accuracy } = z
          .object({
            jobId: z.string().min(1),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            accuracy: z.number().optional(),
          })
          .parse({
            jobId: req.body.jobId,
            latitude: req.body.latitude ? Number(req.body.latitude) : undefined,
            longitude: req.body.longitude ? Number(req.body.longitude) : undefined,
            accuracy: req.body.accuracy ? Number(req.body.accuracy) : undefined,
          });

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const contentType = req.file.mimetype;

        console.log(
          '[EvidenceRoute] Uploading evidence for job:',
          jobId,
          'File:',
          fileName,
          'GPS:',
          latitude ? `${latitude},${longitude}` : 'Not provided'
        );

        // Upload evidence (stores in Blob, returns UPLOADED status)
        const result = await evidenceService.uploadEvidence({
          jobId,
          uploadedBy: req.user!.uid,
          contentType,
          fileName,
          fileBuffer,
        });

        // GPS Verification: If coordinates provided, verify location
        if (latitude !== undefined && longitude !== undefined) {
          try {
            console.log('[EvidenceRoute] Starting GPS verification for evidence:', result.evidenceId);
            await evidenceService.verifyEvidenceLocation(
              result.evidenceId,
              jobId,
              latitude,
              longitude,
              accuracy,
              1 // 1km default radius
            );
            console.log('[EvidenceRoute] GPS verification completed for:', result.evidenceId);
          } catch (gpsError) {
            console.error('[EvidenceRoute] GPS verification error (non-blocking):', gpsError);
            // Don't fail upload if GPS verification fails - still store evidence
          }
        }

        // Update job state to EVIDENCE_SUBMITTED
        try {
          const jobRef = db.collection('jobs').doc(jobId);
          await jobRef.update({
            state: 'EVIDENCE_SUBMITTED',
            lastStateChange: {
              fromState: 'IN_PROGRESS',
              toState: 'EVIDENCE_SUBMITTED',
              timestamp: new Date(),
              userId: req.user!.uid,
              reason: 'Evidence uploaded',
            },
          });
          console.log('[EvidenceRoute] Updated job state to EVIDENCE_SUBMITTED:', jobId);
        } catch (error) {
          console.error('[EvidenceRoute] Error updating job state:', error);
          // Don't fail the upload if job state update fails
        }

        // Auto-queue verification and fraud analysis jobs
        if (queueManager) {
          try {
            console.log('[EvidenceRoute] QueueManager available, starting AI verification queue');
            
            // Get job details for context
            const jobDoc = await db.collection('jobs').doc(jobId).get();
            if (jobDoc.exists) {
              const jobData = jobDoc.data() as any;

              // Mark evidence as UNDER_VERIFICATION
              await evidenceService.markAsUnderVerification(result.evidenceId);
              console.log('[EvidenceRoute] Marked evidence as UNDER_VERIFICATION:', result.evidenceId);

              // Queue AI verification
              const queueJobId = await queueManager.queueAIVerification({
                jobId,
                evidenceIds: [result.evidenceId],
                userId: req.user!.uid,
                requirements: jobData.requirements || '',
                budget: jobData.budget || 0,
              });

              console.log('[EvidenceRoute] Successfully queued AI verification:', {
                queueJobId,
                jobId,
                evidenceId: result.evidenceId,
                timestamp: new Date().toISOString(),
              });
            } else {
              console.error('[EvidenceRoute] Job not found for queueing:', jobId);
            }
          } catch (error) {
            console.error('[EvidenceRoute] Error queueing jobs:', {
              error: error instanceof Error ? error.message : String(error),
              jobId,
              evidenceId: result.evidenceId,
            });
            // Don't fail the upload if queuing fails - already stored
          }
        } else {
          console.warn('[EvidenceRoute] QueueManager not available - verification will not be queued');
        }

        res.status(200).json({
          success: true,
          evidenceId: result.evidenceId,
          hash: result.hash,
          storageUrl: result.storageUrl,
          status: result.status,
        });
      } catch (error) {
        console.error('[EvidenceRoute] Error uploading evidence:', error);
        res.status(400).json({
          error: 'Failed to upload evidence',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /evidence?jobId=:jobId
   * Get all evidence for a job (query parameter version for frontend compatibility)
   */
  router.get('/', requireResourceOwnership(db), async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId } = req.query;

      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({
          error: 'jobId query parameter is required',
        });
      }

      const evidence = await evidenceService.getJobEvidence(jobId);

      res.status(200).json({
        success: true,
        evidence,
      });
    } catch (error) {
      console.error('[EvidenceRoute] Error getting job evidence:', error);
      res.status(500).json({
        error: 'Failed to get evidence',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /evidence/job/:jobId
   * Get all evidence for a job (path parameter version)
   */
  router.get('/job/:jobId', requireResourceOwnership(db), async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId } = req.params;

      const evidence = await evidenceService.getJobEvidence(jobId);

      res.status(200).json({
        success: true,
        evidence,
      });
    } catch (error) {
      console.error('[EvidenceRoute] Error getting job evidence:', error);
      res.status(500).json({
        error: 'Failed to get evidence',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /evidence/:evidenceId
   * Get evidence details
   */
  router.get('/:evidenceId', async (req: AuthenticatedRequest, res) => {
    try {
      const { evidenceId } = req.params;

      const evidence = await evidenceService.getEvidence(evidenceId);

      if (!evidence) {
        return res.status(404).json({ error: 'Evidence not found' });
      }

      // Check authorization
      const isOwner = evidence.uploadedBy === req.user!.uid;
      const isAdmin = req.user!.roles.includes(UserRole.ADMIN);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.status(200).json({
        success: true,
        evidence,
      });
    } catch (error) {
      console.error('[EvidenceRoute] Error getting evidence:', error);
      res.status(500).json({
        error: 'Failed to get evidence',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /evidence/fraud/stats
   * Get fraud detection statistics (admin only)
   */
  router.get(
    '/fraud/stats',
    requireRole(UserRole.ADMIN),
    async (req: AuthenticatedRequest, res) => {
      try {
        const stats = await evidenceService.getFraudStats();

        res.status(200).json({
          success: true,
          stats,
        });
      } catch (error) {
        console.error('[EvidenceRoute] Error getting fraud stats:', error);
        res.status(500).json({
          error: 'Failed to get fraud stats',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
