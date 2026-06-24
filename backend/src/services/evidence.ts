import { Firestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { z } from 'zod';
import { BlobStorageService } from './blob-storage';
import { GPSVerificationService } from './gps-verification';
import { EvidenceStatus } from '../types/index';

export interface EvidenceRecord {
  id: string;
  jobId: string;
  uploadedBy: string; // User ID
  uploadedAt: Timestamp;
  
  // Content info
  contentType: string;
  fileSize: number;
  fileName: string;
  
  // Hashing for fraud detection
  fileHash: string; // SHA-256
  phashHash?: string; // Perceptual hash for images
  
  // Storage location
  storageUrl: string; // Vercel Blob URL
  blobPath?: string; // Blob path for reference
  ipfsHash?: string; // IPFS content hash (optional future use)
  
  // GPS location verification
  gpsLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number; // Accuracy in meters
    timestamp: number;
  };
  gpsVerification?: {
    withinAllowedRadius: boolean;
    distanceMeters: number;
    allowedRadiusMeters: number;
    confidence: number;
    issues?: string[];
  };

  // Metadata
  metadata?: {
    width?: number; // For images
    height?: number;
    duration?: number; // For videos
    exif?: Record<string, unknown>;
  };
  
  // Status - explicit flow: PENDING_UPLOAD -> UPLOADED -> UNDER_VERIFICATION -> VERIFIED/REJECTED
  status: EvidenceStatus;
  verificationNotes?: string;
  
  // For AI processing
  aiAnalyzed: boolean;
  aiAnalysisResult?: {
    confidence: number;
    category: string;
    description: string;
    issues?: string[];
  };
  
  // Fraud detection
  flaggedForFraud: boolean;
  fraudReasons?: string[];
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UploadEvidenceRequest {
  jobId: string;
  uploadedBy: string;
  contentType: string;
  fileName: string;
  fileBuffer: Buffer;
  metadata?: Record<string, unknown>;
}

/**
 * Evidence Service - Manages proof of work completion
 * Foundation for fraud detection and AI verification
 * Integrates with Vercel Blob for file storage
 */
export class EvidenceService {
  private blobStorage: BlobStorageService;

  constructor(private db: Firestore) {
    this.blobStorage = new BlobStorageService();
  }

  /**
   * Generate SHA-256 hash for fraud detection
   */
  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validate file before upload
   */
  async validateEvidenceFile(params: UploadEvidenceRequest): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

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
   * Store evidence metadata and upload file to Vercel Blob
   * Complete flow: PENDING_UPLOAD -> UPLOADED -> UNDER_VERIFICATION -> VERIFIED/REJECTED
   */
  async uploadEvidence(params: UploadEvidenceRequest): Promise<{
    evidenceId: string;
    hash: string;
    storageUrl: string;
    status: EvidenceStatus;
  }> {
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

    // Upload file to Vercel Blob (PENDING_UPLOAD state)
    console.log('[Evidence] Starting file upload to Blob storage...');
    const { url: storageUrl, blobPath } = await this.blobStorage.uploadFile(
      params.fileBuffer,
      params.fileName,
      params.contentType
    );

    const evidenceRecord: EvidenceRecord = {
      id: evidenceId,
      jobId: params.jobId,
      uploadedBy: params.uploadedBy,
      uploadedAt: Timestamp.now(),
      contentType: params.contentType,
      fileSize: params.fileBuffer.byteLength,
      fileName: params.fileName,
      fileHash,
      storageUrl, // Vercel Blob URL
      blobPath,
      status: EvidenceStatus.UPLOADED, // Mark as UPLOADED after successful blob upload
      aiAnalyzed: false,
      flaggedForFraud: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Store metadata in Firestore
    await this.db.collection('evidence').doc(evidenceId).set(evidenceRecord);

    // Log upload transaction
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
        storageUrl,
        blobPath,
      },
      createdAt: Timestamp.now(),
    });

    console.log('[Evidence] Uploaded evidence:', evidenceId, 'for job:', params.jobId, 'Status:', EvidenceStatus.UPLOADED);

    return {
      evidenceId,
      hash: fileHash,
      storageUrl,
      status: EvidenceStatus.UPLOADED,
    };
  }

  /**
   * Check for duplicate uploads using file hash
   */
  private async checkForDuplicates(jobId: string, fileHash: string): Promise<EvidenceRecord[]> {
    const querySnapshot = await this.db
      .collection('evidence')
      .where('jobId', '==', jobId)
      .where('fileHash', '==', fileHash)
      .get();

    return querySnapshot.docs.map((doc) => doc.data() as EvidenceRecord);
  }

  /**
   * Flag evidence for potential fraud
   */
  async flagForFraud(evidenceId: string, reasons: string[]): Promise<void> {
    const evidenceRef = this.db.collection('evidence').doc(evidenceId);

    await evidenceRef.update({
      flaggedForFraud: true,
      fraudReasons: reasons,
      status: 'flagged',
      updatedAt: Timestamp.now(),
    });

    console.log('[Evidence] Flagged for fraud:', evidenceId, 'reasons:', reasons);
  }

  /**
   * Get all evidence for a job
   */
  async getJobEvidence(jobId: string): Promise<EvidenceRecord[]> {
    const querySnapshot = await this.db
      .collection('evidence')
      .where('jobId', '==', jobId)
      .orderBy('uploadedAt', 'desc')
      .get();

    return querySnapshot.docs.map((doc) => doc.data() as EvidenceRecord);
  }

  /**
   * Get evidence by ID
   */
  async getEvidence(evidenceId: string): Promise<EvidenceRecord | null> {
    const doc = await this.db.collection('evidence').doc(evidenceId).get();
    return doc.exists ? (doc.data() as EvidenceRecord) : null;
  }

  /**
   * Mark evidence as UNDER_VERIFICATION (AI analysis starting)
   */
  async markAsUnderVerification(evidenceId: string): Promise<void> {
    await this.db.collection('evidence').doc(evidenceId).update({
      status: EvidenceStatus.UNDER_VERIFICATION,
      updatedAt: Timestamp.now(),
    });

    console.log('[Evidence] Marked as UNDER_VERIFICATION:', evidenceId);
  }

  /**
   * Mark evidence as VERIFIED after successful AI and GPS validation
   */
  async markAsVerified(
    evidenceId: string,
    aiResult: { confidence: number; category: string; description: string }
  ): Promise<void> {
    await this.db.collection('evidence').doc(evidenceId).update({
      status: EvidenceStatus.VERIFIED,
      aiAnalyzed: true,
      aiAnalysisResult: aiResult,
      updatedAt: Timestamp.now(),
    });

    console.log('[Evidence] Marked as VERIFIED:', evidenceId);
  }

  /**
   * Mark evidence as REJECTED after failed verification
   */
  async markAsRejected(
    evidenceId: string,
    reason: string
  ): Promise<void> {
    await this.db.collection('evidence').doc(evidenceId).update({
      status: EvidenceStatus.REJECTED,
      verificationNotes: reason,
      updatedAt: Timestamp.now(),
    });

    console.log('[Evidence] Marked as REJECTED:', evidenceId, 'Reason:', reason);
  }

  /**
   * Verify evidence location matches job location (GPS verification)
   * Records distance and radius check
   */
  async verifyEvidenceLocation(
    evidenceId: string,
    jobId: string,
    evidenceLatitude: number,
    evidenceLongitude: number,
    evidenceAccuracy?: number,
    allowedRadiusKm?: number
  ): Promise<{
    withinRadius: boolean;
    distanceMeters: number;
    confidence: number;
  }> {
    try {
      // Get job to find its location
      const jobDoc = await this.db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const jobData = jobDoc.data() as any;
      const jobLatitude = jobData.latitude;
      const jobLongitude = jobData.longitude;

      if (!jobLatitude || !jobLongitude) {
        console.warn('[Evidence] Job missing location:', jobId);
        return {
          withinRadius: true,
          distanceMeters: 0,
          confidence: 1,
        };
      }

      // Verify GPS location
      const gpsResult = GPSVerificationService.verifyEvidenceLocation({
        jobLatitude,
        jobLongitude,
        evidenceLatitude,
        evidenceLongitude,
        evidenceAccuracy,
        allowedRadiusKm: allowedRadiusKm || 1, // Default 1km radius
      });

      // Store GPS verification result in evidence record
      await this.db.collection('evidence').doc(evidenceId).update({
        gpsLocation: {
          latitude: evidenceLatitude,
          longitude: evidenceLongitude,
          accuracy: evidenceAccuracy,
          timestamp: Date.now(),
        },
        gpsVerification: {
          withinAllowedRadius: gpsResult.withinRadius,
          distanceMeters: gpsResult.distanceMeters,
          allowedRadiusMeters: (allowedRadiusKm || 1) * 1000,
          confidence: gpsResult.confidence,
          issues: gpsResult.issues,
        },
        updatedAt: Timestamp.now(),
      });

      console.log(
        '[Evidence] GPS verification recorded:',
        evidenceId,
        'Distance:',
        gpsResult.distanceMeters,
        'm, Within radius:',
        gpsResult.withinRadius
      );

      return {
        withinRadius: gpsResult.withinRadius,
        distanceMeters: gpsResult.distanceMeters,
        confidence: gpsResult.confidence,
      };
    } catch (error) {
      console.error('[Evidence] GPS verification error:', error);
      throw error;
    }
  }

  /**
   * Get fraud detection statistics
   */
  async getFraudStats(): Promise<{
    totalFlagged: number;
    byReason: Record<string, number>;
  }> {
    const flaggedDocs = await this.db
      .collection('evidence')
      .where('flaggedForFraud', '==', true)
      .get();

    const stats = {
      totalFlagged: flaggedDocs.size,
      byReason: {} as Record<string, number>,
    };

    flaggedDocs.forEach((doc) => {
      const evidence = doc.data() as EvidenceRecord;
      if (evidence.fraudReasons) {
        evidence.fraudReasons.forEach((reason) => {
          stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
        });
      }
    });

    return stats;
  }
}
