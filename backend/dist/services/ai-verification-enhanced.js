"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIVerificationServiceEnhanced = void 0;
const firestore_1 = require("firebase-admin/firestore");
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
/**
 * Structured verification output schema with Zod validation
 */
const VerificationOutputSchema = zod_1.z.object({
    verdict: zod_1.z.enum(['approved', 'rejected', 'needs_review']),
    confidence: zod_1.z.number().min(0).max(1),
    completionScore: zod_1.z.number().min(0).max(100),
    requirementsMet: zod_1.z.record(zod_1.z.boolean()),
    issues: zod_1.z.array(zod_1.z.string()),
    suggestedAction: zod_1.z.enum(['release', 'refund', 'dispute']),
    analysis: zod_1.z.string(),
});
/**
 * Enhanced AI Verification Service - Uses GPT-4o with actual evidence content
 * 3-tier confidence system:
 * - >= 0.90 → AUTO_APPROVE (safe for automatic release)
 * - 0.70-0.89 → MANUAL_REVIEW (needs admin verification)
 * - < 0.70 → DISPUTED (automatic dispute, buyer refund)
 */
class AIVerificationServiceEnhanced {
    constructor(db, apiKey, confidenceThreshold = 0.90) {
        this.db = db;
        this.confidenceThreshold = confidenceThreshold;
        this.AUTO_APPROVE_THRESHOLD = 0.90;
        this.MANUAL_REVIEW_THRESHOLD = 0.70;
        this.openai = new OpenAI({ apiKey });
    }
    /**
     * Verify job completion using AI analysis with actual evidence
     */
    async verifyCompletion(request) {
        console.log('[AIVerification] Starting verification for job:', request.jobId);
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
                analysis: 'Job cannot be verified without evidence',
                timestamp: Date.now(),
            };
        }
        // Analyze evidence with actual content
        const analysis = await this.analyzeEvidenceWithGPT4o(evidence, request.requirements, request.budget);
        // Parse and validate AI response with Zod
        const result = this.parseAndValidateAIResponse(analysis, request);
        // Store verification result
        await this.storeVerificationResult(request.jobId, result);
        return result;
    }
    /**
     * Get evidence records from database
     */
    async getEvidenceForJob(evidenceIds) {
        const evidence = [];
        for (const id of evidenceIds) {
            const doc = await this.db.collection('evidence').doc(id).get();
            if (doc.exists) {
                evidence.push(doc.data());
            }
        }
        return evidence;
    }
    /**
     * Fetch evidence content from storage URL with retry logic
     * Retries up to 3 times with exponential backoff
     */
    async fetchEvidenceContent(storageUrl, contentType) {
        const maxRetries = 3;
        const baseDelayMs = 1000;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios_1.default.get(storageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                });
                const buffer = Buffer.from(response.data);
                // Validate file size (max 50MB)
                if (buffer.length > 50 * 1024 * 1024) {
                    console.error('[AIVerification] File too large:', buffer.length, 'bytes');
                    return null;
                }
                // Convert to base64 for GPT-4o
                const base64 = buffer.toString('base64');
                console.log('[AIVerification] Fetched evidence (', buffer.length, 'bytes) on attempt', attempt);
                return base64;
            }
            catch (error) {
                const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
                const isLastAttempt = attempt === maxRetries;
                if (isLastAttempt) {
                    console.error('[AIVerification] Failed to fetch evidence after', maxRetries, 'attempts:', error instanceof Error ? error.message : error);
                    // Mark evidence as fetch_failed in database for later retry
                    await this.logFetchFailure(storageUrl, error).catch(() => {
                        // Silently fail if logging fails
                    });
                    return null;
                }
                console.warn('[AIVerification] Fetch attempt', attempt, 'failed, retrying in', delayMs, 'ms');
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
        return null;
    }
    /**
     * Log evidence fetch failures for later manual retry
     */
    async logFetchFailure(storageUrl, error) {
        try {
            await this.db.collection('fetch_failures').add({
                storageUrl,
                error: error instanceof Error ? error.message : String(error),
                timestamp: firestore_1.Timestamp.now(),
                status: 'pending_retry',
            });
        }
        catch (logError) {
            console.error('[AIVerification] Could not log fetch failure:', logError);
        }
    }
    /**
     * Analyze evidence using GPT-4o with actual content
     */
    async analyzeEvidenceWithGPT4o(evidence, requirements, budget) {
        // Build content parts with actual evidence
        const contentParts = [
            {
                type: 'text',
                text: this.buildVerificationPrompt(requirements, budget, evidence.length),
            },
        ];
        // Fetch and add actual evidence content
        for (const e of evidence) {
            try {
                // Supported media types for GPT-4o
                if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(e.contentType)) {
                    const imageData = await this.fetchEvidenceContent(e.storageUrl, e.contentType);
                    if (imageData) {
                        contentParts.push({
                            type: 'image',
                            image: {
                                data: imageData,
                                media_type: e.contentType,
                            },
                        });
                    }
                }
                else if (e.contentType === 'application/pdf') {
                    // For PDFs, include description
                    contentParts.push({
                        type: 'text',
                        text: `\nPDF Evidence: ${e.fileName}\n- Size: ${e.fileSize} bytes\n- Hash: ${e.fileHash}`,
                    });
                }
                else if (e.contentType.startsWith('video/')) {
                    // For videos, include metadata
                    contentParts.push({
                        type: 'text',
                        text: `\nVideo Evidence: ${e.fileName}\n- Type: ${e.contentType}\n- Size: ${e.fileSize} bytes\n- Duration: ${e.metadata?.duration || 'unknown'} seconds`,
                    });
                }
                else if (e.contentType === 'text/plain') {
                    const textData = await this.fetchEvidenceContent(e.storageUrl, e.contentType);
                    if (textData) {
                        const textContent = Buffer.from(textData, 'base64').toString('utf-8').slice(0, 1000);
                        contentParts.push({
                            type: 'text',
                            text: `\nText Evidence: ${e.fileName}\n${textContent}`,
                        });
                    }
                }
            }
            catch (error) {
                console.error('[AIVerification] Error processing evidence:', e.id, error);
                // Continue with other evidence
            }
        }
        try {
            const message = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: contentParts,
                    },
                ],
                max_tokens: 1500,
                temperature: 0.3, // Lower temperature for more consistent verdicts
            });
            const response = message.content[0];
            if (!response || response.type !== 'text') {
                throw new Error('Invalid response from OpenAI');
            }
            // Extract JSON from response
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in GPT-4o response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            const validated = VerificationOutputSchema.parse(parsed);
            return validated;
        }
        catch (error) {
            console.error('[AIVerification] GPT-4o error:', error);
            throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Parse and validate AI response using Zod with 3-tier confidence system
     */
    parseAndValidateAIResponse(output, request) {
        try {
            const confidence = Math.min(1, Math.max(0, output.confidence));
            const completionScore = Math.min(100, Math.max(0, output.completionScore));
            // Apply 3-tier confidence system
            let verdict = output.verdict;
            let confidenceTier = '';
            if (verdict === 'approved') {
                if (confidence >= this.AUTO_APPROVE_THRESHOLD) {
                    confidenceTier = 'AUTO_APPROVE';
                    // Keep verdict as approved
                }
                else if (confidence >= this.MANUAL_REVIEW_THRESHOLD) {
                    confidenceTier = 'MANUAL_REVIEW';
                    verdict = 'needs_review';
                    console.log('[AIVerification] Confidence', confidence, '< ', this.AUTO_APPROVE_THRESHOLD, '→ needs_review');
                }
                else {
                    confidenceTier = 'AUTO_DISPUTE';
                    verdict = 'rejected';
                    console.log('[AIVerification] Confidence', confidence, '< ', this.MANUAL_REVIEW_THRESHOLD, '→ rejected (auto-dispute)');
                }
            }
            else if (verdict === 'rejected') {
                confidenceTier = confidence >= 0.5 ? 'HIGH_CONFIDENCE_REJECT' : 'LOW_CONFIDENCE_REJECT';
            }
            return {
                jobId: request.jobId,
                verdict: verdict,
                confidence,
                completionScore,
                requirementsMet: output.requirementsMet,
                issues: output.issues,
                suggestedAction: output.suggestedAction,
                analysis: `[${confidenceTier}] ${output.analysis}`,
                timestamp: Date.now(),
            };
        }
        catch (error) {
            console.error('[AIVerification] Parse/validation error:', error);
            return {
                jobId: request.jobId,
                verdict: 'needs_review',
                confidence: 0,
                completionScore: 0,
                requirementsMet: {},
                issues: [`AI response validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
                suggestedAction: 'refund',
                analysis: 'Could not validate AI response',
                timestamp: Date.now(),
            };
        }
    }
    /**
     * Build verification prompt for GPT-4o
     */
    buildVerificationPrompt(requirements, budget, evidenceCount) {
        return `You are a work verification AI for a freelance marketplace. Analyze the provided evidence to verify if the work requirements were met.

Job Requirements:
${requirements}

Budget: $${budget}
Evidence Files Provided: ${evidenceCount}

Please evaluate:
1. Does the evidence prove the work was completed?
2. Are all requirements met?
3. Is the quality acceptable for the budget?
4. Any red flags or concerns?

Respond ONLY with valid JSON format:
{
  "verdict": "approved" | "rejected" | "needs_review",
  "confidence": 0-1,
  "completionScore": 0-100,
  "requirementsMet": { "requirement": true/false },
  "issues": ["list of issues"],
  "suggestedAction": "release" | "refund" | "dispute",
  "analysis": "detailed explanation"
}`;
    }
    /**
     * Store verification result in Firestore
     */
    async storeVerificationResult(jobId, result) {
        const resultId = this.db.collection('verification_results').doc().id;
        await this.db.collection('verification_results').doc(resultId).set({
            id: resultId,
            jobId,
            ...result,
            createdAt: firestore_1.Timestamp.now(),
        });
        console.log('[AIVerification] Stored verification result:', resultId);
    }
    /**
     * Get verification result for a job
     */
    async getVerificationResult(jobId) {
        const query = await this.db
            .collection('verification_results')
            .where('jobId', '==', jobId)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        if (query.empty) {
            return null;
        }
        const doc = query.docs[0].data();
        return {
            jobId: doc.jobId,
            verdict: doc.verdict,
            confidence: doc.confidence,
            completionScore: doc.completionScore,
            requirementsMet: doc.requirementsMet,
            issues: doc.issues,
            suggestedAction: doc.suggestedAction,
            analysis: doc.analysis,
            timestamp: doc.timestamp,
        };
    }
}
exports.AIVerificationServiceEnhanced = AIVerificationServiceEnhanced;
