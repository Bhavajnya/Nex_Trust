"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvidenceRoutes = createEvidenceRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const evidence_1 = require("../services/evidence");
const auth_1 = require("../middleware/auth");
function createEvidenceRoutes(db, queueManager) {
    const router = (0, express_1.Router)();
    const evidenceService = new evidence_1.EvidenceService(db);
    // Apply authentication middleware
    router.use((0, auth_1.createAuthMiddleware)(db));
    /**
     * POST /evidence/upload
     * Upload evidence for a job
     */
    router.post('/upload', (0, auth_1.requireRole)(auth_1.UserRole.WORKER), (0, auth_1.requireResourceOwnership)(db), async (req, res) => {
        try {
            const { jobId, contentType, fileName, fileData } = zod_1.z
                .object({
                jobId: zod_1.z.string().min(1),
                contentType: zod_1.z.string(),
                fileName: zod_1.z.string(),
                fileData: zod_1.z.string(), // base64 encoded
            })
                .parse(req.body);
            // Decode base64 file data
            const fileBuffer = Buffer.from(fileData, 'base64');
            const result = await evidenceService.uploadEvidence({
                jobId,
                uploadedBy: req.user.uid,
                contentType,
                fileName,
                fileBuffer,
            });
            // Auto-queue verification and fraud analysis jobs
            if (queueManager) {
                try {
                    // Get job details for context
                    const jobDoc = await db.collection('jobs').doc(jobId).get();
                    if (jobDoc.exists) {
                        const jobData = jobDoc.data();
                        // Queue fraud analysis first (lower priority)
                        await queueManager.queueFraudAnalysis({
                            evidenceId: result.id,
                            jobId,
                            fileHash: result.fileHash,
                            userId: req.user.uid,
                            contentType,
                        });
                        // Queue AI verification (higher priority)
                        await queueManager.queueAIVerification({
                            jobId,
                            evidenceIds: [result.id],
                            userId: req.user.uid,
                            requirements: jobData.requirements || '',
                            budget: jobData.budget || 0,
                        });
                        console.log('[EvidenceRoute] Auto-queued verification and fraud jobs for:', jobId);
                    }
                }
                catch (error) {
                    console.error('[EvidenceRoute] Error queueing jobs:', error);
                    // Don't fail the upload if queuing fails - already stored
                }
            }
            res.status(200).json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            console.error('[EvidenceRoute] Error uploading evidence:', error);
            res.status(400).json({
                error: 'Failed to upload evidence',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * GET /evidence/job/:jobId
     * Get all evidence for a job
     */
    router.get('/job/:jobId', (0, auth_1.requireResourceOwnership)(db), async (req, res) => {
        try {
            const { jobId } = req.params;
            const evidence = await evidenceService.getJobEvidence(jobId);
            res.status(200).json({
                success: true,
                evidence,
            });
        }
        catch (error) {
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
    router.get('/:evidenceId', async (req, res) => {
        try {
            const { evidenceId } = req.params;
            const evidence = await evidenceService.getEvidence(evidenceId);
            if (!evidence) {
                return res.status(404).json({ error: 'Evidence not found' });
            }
            // Check authorization
            const isOwner = evidence.uploadedBy === req.user.uid;
            const isAdmin = req.user.roles.includes(auth_1.UserRole.ADMIN);
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: 'Access denied' });
            }
            res.status(200).json({
                success: true,
                evidence,
            });
        }
        catch (error) {
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
    router.get('/fraud/stats', (0, auth_1.requireRole)(auth_1.UserRole.ADMIN), async (req, res) => {
        try {
            const stats = await evidenceService.getFraudStats();
            res.status(200).json({
                success: true,
                stats,
            });
        }
        catch (error) {
            console.error('[EvidenceRoute] Error getting fraud stats:', error);
            res.status(500).json({
                error: 'Failed to get fraud stats',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
