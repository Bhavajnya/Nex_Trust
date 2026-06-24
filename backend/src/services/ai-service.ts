import { Firestore } from 'firebase-admin/firestore';
import { AIVerificationResult } from '../queues/types';

export interface VerificationRequest {
  jobId: string;
  evidenceIds: string[];
  requirements: string;
  budget: number;
}

/**
 * Abstract AI Service Interface
 * Allows plugging in different AI providers (OpenAI, Gemini, Mock)
 */
export abstract class AIServiceBase {
  constructor(
    protected db: Firestore,
    protected confidenceThreshold: number = 0.75
  ) {}

  abstract verifyCompletion(request: VerificationRequest): Promise<AIVerificationResult>;
  abstract getEvidenceForJob(evidenceIds: string[]): Promise<any[]>;
  abstract extractRequirements(requirements: string): Promise<string[]>;
}

/**
 * Mock AI Service for MVP - Returns deterministic results for testing
 */
export class MockAIService extends AIServiceBase {
  constructor(db: Firestore, confidenceThreshold: number = 0.75) {
    super(db, confidenceThreshold);
    console.log('[MockAIService] Initialized (MVP mode)');
  }

  async verifyCompletion(request: VerificationRequest): Promise<AIVerificationResult> {
    console.log('[MockAIService] Verifying job:', request.jobId);

    const evidence = await this.getEvidenceForJob(request.evidenceIds);

    if (evidence.length === 0) {
      return {
        jobId: request.jobId,
        verdict: 'rejected',
        confidence: 1.0,
        completionScore: 0,
        requirementsMet: {},
        issues: ['No evidence provided'],
        suggestedAction: 'refund',
        analysis: 'Mock AI: Job cannot be verified without evidence',
        timestamp: Date.now(),
      };
    }

    // Mock: Extract requirements and check against evidence
    const requirements = await this.extractRequirements(request.requirements);
    const requirementsMet: Record<string, boolean> = {};
    
    // Simulate requirement checking
    requirements.forEach((req) => {
      // 95% approval rate for demo purposes
      requirementsMet[req] = Math.random() > 0.05;
    });

    const allMet = Object.values(requirementsMet).every((v) => v);
    const metCount = Object.values(requirementsMet).filter((v) => v).length;
    const completionScore = (metCount / requirements.length) * 100;

    return {
      jobId: request.jobId,
      verdict: allMet ? 'approved' : 'needs_review',
      confidence: 0.95, // Mock returns high confidence
      completionScore: Math.round(completionScore),
      requirementsMet,
      issues: allMet ? [] : ['Some requirements may not be fully met - review recommended'],
      suggestedAction: allMet ? 'release' : 'dispute',
      analysis: `Mock AI Analysis: Evidence shows ${metCount}/${requirements.length} requirements met. Recommended action: ${
        allMet ? 'RELEASE funds to worker' : 'INITIATE dispute for manual review'
      }`,
      timestamp: Date.now(),
    };
  }

  async getEvidenceForJob(evidenceIds: string[]): Promise<any[]> {
    if (!evidenceIds || evidenceIds.length === 0) {
      return [];
    }

    try {
      const evidenceCollection = this.db.collection('evidence');
      const evidence = [];

      for (const id of evidenceIds) {
        const doc = await evidenceCollection.doc(id).get();
        if (doc.exists) {
          evidence.push({ id: doc.id, ...doc.data() });
        }
      }

      return evidence;
    } catch (err) {
      console.error('[MockAIService] Error fetching evidence:', err);
      return [];
    }
  }

  async extractRequirements(requirements: string): Promise<string[]> {
    // Simple mock: split by common delimiters
    const parsed = requirements
      .split(/[,;.\n]/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .slice(0, 5); // Limit to 5 requirements

    return parsed.length > 0 ? parsed : ['General quality check'];
  }
}

/**
 * Factory function to get appropriate AI service based on ENV
 */
export function createAIService(db: Firestore): AIServiceBase {
  const useMockAI = process.env.USE_MOCK_AI === 'true';

  if (useMockAI) {
    console.log('[AIService] Using Mock AI Service');
    return new MockAIService(db);
  }

  // TODO: When OpenAI is added, implement real service here
  console.log('[AIService] Real AI not configured, falling back to Mock');
  return new MockAIService(db);
}
