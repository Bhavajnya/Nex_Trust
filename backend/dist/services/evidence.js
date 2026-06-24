"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceService = void 0;
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = __importDefault(require("crypto"));
/**
 * Evidence Service - Manages proof of work completion
 * Foundation for fraud detection and AI verification
 */
class EvidenceService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Generate SHA-256 hash for fraud detection
     */
    generateFileHash(buffer) {
        return crypto_1.default.createHash('sha256').update(buffer).digest('hex');
    }
    /**
     * Validate file before upload
     */
    async validateEvidenceFile(params) {
        const errors = [];
        // Check job exists
        const jobDoc = await this.db.collection('jobs').doc(params.jobId).get();
        if (!jobDoc.exists) {
            errors.push('Job not found');
        }
        // Check file size (max 100MB)
        if (params.fileBuffer.byteLength > 100 * 1024 * 1024) {
            errors.push('File size exceeds 100MB limit');
        }
        // Check minimum file size (at least 1KB)
        if (params.fileBuffer.byteLength < 1024) {
            errors.push('File size too small (minimum 1KB)');
        }
        // Validate content type
        const validTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf', 'text/plain'];
        if (!validTypes.includes(params.contentType)) {
            errors.push(`Unsupported content type: ${params.contentType}`);
        }
        // Check for null bytes (security)
        if (params.fileBuffer.includes(0x00)) {
            errors.push('File contains null bytes (potential security issue)');
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Store evidence metadata and upload file
     * Note: Actual file storage is delegated to cloud provider
     */
    async uploadEvidence(params) {
        // Validate
        const validation = await this.validateEvidenceFile(params);
        if (!validation.isValid) {
            throw new Error(`Evidence validation failed: ${validation.errors.join(', ')}`);
        }
        const fileHash = this.generateFileHash(params.fileBuffer);
        // Check for duplicate uploads (same file, same job)
        const duplicates = await this.checkForDuplicates(params.jobId, fileHash);
        if (duplicates.length > 0) {
            throw new Error(`Duplicate evidence detected. Previous upload: ${duplicates[0].id}`);
        }
        // Create evidence record
        const evidenceId = this.db.collection('evidence').doc().id;
        const storageUrl = `ipfs://${fileHash}`; // Placeholder - actual upload handled separately
        const evidenceRecord = {
            id: evidenceId,
            jobId: params.jobId,
            uploadedBy: params.uploadedBy,
            uploadedAt: firestore_1.Timestamp.now(),
            contentType: params.contentType,
            fileSize: params.fileBuffer.byteLength,
            fileName: params.fileName,
            fileHash,
            storageUrl,
            status: 'pending',
            aiAnalyzed: false,
            flaggedForFraud: false,
            createdAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        };
        // Store metadata in Firestore
        await this.db.collection('evidence').doc(evidenceId).set(evidenceRecord);
        // Log upload
        await this.db.collection('transaction_logs').doc().set({
            operation: 'evidence_uploaded',
            status: 'completed',
            jobId: params.jobId,
            evidenceId,
            details: {
                fileName: params.fileName,
                fileHash,
                fileSize: params.fileBuffer.byteLength,
                contentType: params.contentType,
            },
            createdAt: firestore_1.Timestamp.now(),
        });
        console.log('[Evidence] Uploaded evidence:', evidenceId, 'for job:', params.jobId);
        return {
            evidenceId,
            hash: fileHash,
            storageUrl,
        };
    }
    /**
     * Check for duplicate uploads using file hash
     */
    async checkForDuplicates(jobId, fileHash) {
        const querySnapshot = await this.db
            .collection('evidence')
            .where('jobId', '==', jobId)
            .where('fileHash', '==', fileHash)
            .get();
        return querySnapshot.docs.map((doc) => doc.data());
    }
    /**
     * Flag evidence for potential fraud
     */
    async flagForFraud(evidenceId, reasons) {
        const evidenceRef = this.db.collection('evidence').doc(evidenceId);
        await evidenceRef.update({
            flaggedForFraud: true,
            fraudReasons: reasons,
            status: 'flagged',
            updatedAt: firestore_1.Timestamp.now(),
        });
        console.log('[Evidence] Flagged for fraud:', evidenceId, 'reasons:', reasons);
    }
    /**
     * Get all evidence for a job
     */
    async getJobEvidence(jobId) {
        const querySnapshot = await this.db
            .collection('evidence')
            .where('jobId', '==', jobId)
            .orderBy('uploadedAt', 'desc')
            .get();
        return querySnapshot.docs.map((doc) => doc.data());
    }
    /**
     * Get evidence by ID
     */
    async getEvidence(evidenceId) {
        const doc = await this.db.collection('evidence').doc(evidenceId).get();
        return doc.exists ? doc.data() : null;
    }
    /**
     * Mark evidence as verified after AI analysis
     */
    async markAsVerified(evidenceId, aiResult) {
        await this.db.collection('evidence').doc(evidenceId).update({
            status: 'verified',
            aiAnalyzed: true,
            aiAnalysisResult: aiResult,
            updatedAt: firestore_1.Timestamp.now(),
        });
        console.log('[Evidence] Marked as verified:', evidenceId);
    }
    /**
     * Get fraud detection statistics
     */
    async getFraudStats() {
        const flaggedDocs = await this.db
            .collection('evidence')
            .where('flaggedForFraud', '==', true)
            .get();
        const stats = {
            totalFlagged: flaggedDocs.size,
            byReason: {},
        };
        flaggedDocs.forEach((doc) => {
            const evidence = doc.data();
            if (evidence.fraudReasons) {
                evidence.fraudReasons.forEach((reason) => {
                    stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
                });
            }
        });
        return stats;
    }
}
exports.EvidenceService = EvidenceService;
