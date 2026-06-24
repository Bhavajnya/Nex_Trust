import { Firestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';

export interface FraudIndicator {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;
  description: string;
}

export interface FraudScore {
  evidenceId: string;
  jobId: string;
  riskScore: number; // 0-100
  verdict: 'clean' | 'suspicious' | 'flagged';
  indicators: FraudIndicator[];
  timestamp: number;
}

/**
 * Fraud Scoring Engine - Detects suspicious activity patterns
 */
export class FraudScorer {
  constructor(private db: Firestore) {}

  /**
   * Score evidence for fraud risk
   */
  async scoreEvidence(
    evidenceId: string,
    jobId: string,
    fileHash: string,
    userId: string,
    contentType: string
  ): Promise<FraudScore> {
    const indicators: FraudIndicator[] = [];

    // Check 1: Cross-job evidence reuse (CRITICAL for fraud detection)
    const crossJobScore = await this.checkCrossJobEvidenceReuse(fileHash, userId, jobId);
    if (crossJobScore > 0) {
      indicators.push({
        type: 'cross_job_evidence_reuse',
        severity: 'critical',
        weight: crossJobScore,
        description: `File hash matches evidence from different freelancer or multiple jobs - potential reuse fraud`,
      });
    }

    // Check 2: Duplicate evidence within same job
    const duplicateScore = await this.checkDuplicateEvidenceWithinJob(fileHash, jobId);
    if (duplicateScore > 0) {
      indicators.push({
        type: 'duplicate_evidence_same_job',
        severity: 'high',
        weight: duplicateScore,
        description: `File hash matches evidence in same job`,
      });
    }

    // Check 4: User fraud history
    const historyScore = await this.checkUserFraudHistory(userId);
    if (historyScore > 0) {
      indicators.push({
        type: 'user_fraud_history',
        severity: historyScore > 50 ? 'critical' : 'high',
        weight: historyScore,
        description: `User has history of disputed or flagged submissions`,
      });
    }

    // Check 5: Timing anomalies
    const timingScore = await this.checkTimingAnomalies(jobId, userId);
    if (timingScore > 0) {
      indicators.push({
        type: 'timing_anomaly',
        severity: 'medium',
        weight: timingScore,
        description: `Evidence uploaded unusually quickly after job start`,
      });
    }

    // Check 6: Content type validation
    const contentScore = this.checkContentType(contentType);
    if (contentScore > 0) {
      indicators.push({
        type: 'suspicious_content_type',
        severity: 'low',
        weight: contentScore,
        description: `Unexpected file type for job category`,
      });
    }

    // Check 7: User velocity (too many submissions in short time)
    const velocityScore = await this.checkUserVelocity(userId);
    if (velocityScore > 0) {
      indicators.push({
        type: 'high_submission_velocity',
        severity: velocityScore > 30 ? 'medium' : 'low',
        weight: velocityScore,
        description: `User submitting unusually high volume of work`,
      });
    }

    // Calculate weighted risk score
    const riskScore = this.calculateRiskScore(indicators);

    // Determine verdict
    const verdict = this.determineVerdict(riskScore);

    const score: FraudScore = {
      evidenceId,
      jobId,
      riskScore,
      verdict,
      indicators,
      timestamp: Date.now(),
    };

    // Store score
    await this.storeScore(score);

    return score;
  }

  /**
   * Check for cross-job evidence reuse (same file across multiple jobs)
   * CRITICAL: Detects fraud where freelancer reuses same evidence for multiple jobs
   */
  private async checkCrossJobEvidenceReuse(fileHash: string, userId: string, currentJobId: string): Promise<number> {
    const query = await this.db
      .collection('evidence')
      .where('fileHash', '==', fileHash)
      .get();

    if (query.size <= 1) {
      return 0;
    }

    // Analyze jobs this evidence appears in
    const jobIds = new Set<string>();
    const uploaderIds = new Set<string>();
    let matchCount = 0;

    query.forEach((doc) => {
      const evidence = doc.data() as any;
      jobIds.add(evidence.jobId);
      uploaderIds.add(evidence.uploadedBy);
      if (evidence.jobId !== currentJobId) {
        matchCount++;
      }
    });

    // RED FLAG: Same file used by different freelancers (definite fraud)
    if (uploaderIds.size > 1) {
      console.log('[FraudScorer] CRITICAL: Cross-uploader evidence reuse detected');
      return 100; // Maximum fraud score
    }

    // HIGH FLAG: Same freelancer reused file across multiple jobs
    if (matchCount > 0) {
      console.log(`[FraudScorer] WARNING: Evidence reused in ${matchCount} other jobs`);
      return Math.min(100, 50 + matchCount * 15);
    }

    return 0;
  }

  /**
   * Check for duplicate evidence within the same job
   */
  private async checkDuplicateEvidenceWithinJob(fileHash: string, jobId: string): Promise<number> {
    const query = await this.db
      .collection('evidence')
      .where('fileHash', '==', fileHash)
      .where('jobId', '==', jobId)
      .get();

    // If found in multiple evidence records for same job, it's suspicious
    if (query.size > 1) {
      // Higher weight if same file uploaded multiple times
      return Math.min(100, query.size * 20);
    }

    return 0;
  }

  /**
   * Check user's fraud history
   */
  private async checkUserFraudHistory(userId: string): Promise<number> {
    // Get user's past disputes and flags
    const disputes = await this.db
      .collection('evidence')
      .where('uploadedBy', '==', userId)
      .where('flaggedForFraud', '==', true)
      .get();

    if (disputes.size === 0) {
      return 0;
    }

    // Calculate fraud rate
    const totalSubmissions = await this.db.collection('evidence').where('uploadedBy', '==', userId).get();

    const fraudRate = disputes.size / totalSubmissions.size;
    return Math.min(100, fraudRate * 100);
  }

  /**
   * Check for timing anomalies
   */
  private async checkTimingAnomalies(jobId: string, userId: string): Promise<number> {
    const jobDoc = await this.db.collection('jobs').doc(jobId).get();

    if (!jobDoc.exists) {
      return 0;
    }

    const job = jobDoc.data() as { createdAt: Timestamp; freelancerId?: string };

    // If user is not freelancer, no anomaly
    if (job.freelancerId !== userId) {
      return 0;
    }

    const jobCreatedTime = job.createdAt.toMillis();
    const nowTime = Date.now();
    const timeSinceCreation = nowTime - jobCreatedTime;

    // If evidence submitted within 5 minutes of job creation, suspicious
    if (timeSinceCreation < 5 * 60 * 1000) {
      return 70; // High suspicion
    }

    // If evidence submitted within 30 minutes, slightly suspicious
    if (timeSinceCreation < 30 * 60 * 1000) {
      return 30;
    }

    return 0;
  }

  /**
   * Check for suspicious content types
   */
  private checkContentType(contentType: string): number {
    // TODO: Implement content type validation based on job category
    // For now, all common types are fine

    const validTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf', 'text/plain'];

    if (!validTypes.includes(contentType)) {
      return 20; // Slight suspicion for unusual types
    }

    return 0;
  }

  /**
   * Check user submission velocity
   */
  private async checkUserVelocity(userId: string): Promise<number> {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentSubmissions = await this.db
      .collection('evidence')
      .where('uploadedBy', '==', userId)
      .where('uploadedAt', '>=', Timestamp.fromMillis(oneHourAgo))
      .get();

    // If more than 5 submissions in an hour, suspicious
    if (recentSubmissions.size > 5) {
      return Math.min(50, recentSubmissions.size * 5);
    }

    return 0;
  }

  /**
   * Calculate weighted risk score
   */
  private calculateRiskScore(indicators: FraudIndicator[]): number {
    if (indicators.length === 0) {
      return 0;
    }

    // Weight by severity
    const severityWeights = {
      low: 0.2,
      medium: 0.5,
      high: 0.8,
      critical: 1.0,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const indicator of indicators) {
      const severityMultiplier = severityWeights[indicator.severity];
      const weightedScore = indicator.weight * severityMultiplier;
      totalScore += weightedScore;
      totalWeight += 1;
    }

    return Math.min(100, totalScore / totalWeight);
  }

  /**
   * Determine fraud verdict based on risk score
   */
  private determineVerdict(riskScore: number): 'clean' | 'suspicious' | 'flagged' {
    if (riskScore < 30) {
      return 'clean';
    }

    if (riskScore < 70) {
      return 'suspicious';
    }

    return 'flagged';
  }

  /**
   * Store fraud score
   */
  private async storeScore(score: FraudScore): Promise<void> {
    await this.db
      .collection('fraud_scores')
      .doc(`${score.evidenceId}_${Date.now()}`)
      .set({
        ...score,
        createdAt: Timestamp.now(),
      });

    console.log('[FraudScorer] Stored fraud score:', score.evidenceId, 'risk:', score.riskScore);
  }

  /**
   * Get fraud statistics
   */
  async getFraudStats(): Promise<{
    totalScored: number;
    clean: number;
    suspicious: number;
    flagged: number;
    averageRiskScore: number;
  }> {
    const query = await this.db.collection('fraud_scores').get();

    let clean = 0,
      suspicious = 0,
      flagged = 0;
    let totalRisk = 0;

    query.forEach((doc) => {
      const score = doc.data() as FraudScore;
      switch (score.verdict) {
        case 'clean':
          clean++;
          break;
        case 'suspicious':
          suspicious++;
          break;
        case 'flagged':
          flagged++;
          break;
      }
      totalRisk += score.riskScore;
    });

    const total = query.size;

    return {
      totalScored: total,
      clean,
      suspicious,
      flagged,
      averageRiskScore: total > 0 ? totalRisk / total : 0,
    };
  }
}
