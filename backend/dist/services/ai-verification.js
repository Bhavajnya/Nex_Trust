"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIVerificationService = void 0;
const firestore_1 = require("firebase-admin/firestore");
const ai_service_1 = require("./ai-service");
/**
 * AI Verification Service - Wrapper around configurable AI provider
 * Uses MockAIService by default, can be switched to OpenAI/Gemini via ENV
 * Core of Magic Handshake smart judge system
 */
class AIVerificationService {
    constructor(db, apiKey, confidenceThreshold = 0.75) {
        this.db = db;
        this.confidenceThreshold = confidenceThreshold;
        // Create appropriate AI service based on ENV configuration
        this.aiService = (0, ai_service_1.createAIService)(db);
    }
    /**
     * Verify job completion using configured AI service
     */
    async verifyCompletion(request) {
        console.log('[AIVerification] Starting verification for job:', request.jobId);
        return this.aiService.verifyCompletion(request);
        const analysis = await this.analyzeEvidenceWithGPT(evidence, request.requirements, request.budget);
        // Parse AI response
        const result = this.parseAIResponse(analysis, request);
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
     * Analyze evidence using GPT-4 Vision
     */
    async analyzeEvidenceWithGPT(evidence, requirements, budget) {
        // Construct verification prompt
        const prompt = this.buildVerificationPrompt(requirements, budget, evidence.length);
        // TODO: In production, would fetch actual image data from IPFS
        // For now, using evidence metadata
        const contentParts = [
            {
                type: 'text',
                text: prompt,
            },
        ];
        // Add evidence metadata as context (actual images would come from IPFS)
        for (const e of evidence) {
            contentParts.push({
                type: 'text',
                text: `\n\nEvidence: ${e.fileName}\n- Type: ${e.contentType}\n- Size: ${e.fileSize} bytes\n- Hash: ${e.fileHash}`,
            });
        }
        try {
            const message = await this.openai.chat.completions.create({
                model: 'gpt-4-vision-preview',
                messages: [
                    {
                        role: 'user',
                        content: contentParts,
                    },
                ],
                max_tokens: 1000,
                temperature: 0.5, // Lower temperature for consistent verdicts
            });
            const response = message.content[0];
            if (response.type === 'text') {
                return response.text;
            }
            throw new Error('Unexpected response type from OpenAI');
        }
        catch (error) {
            console.error('[AIVerification] GPT-4 error:', error);
            throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Build verification prompt for GPT-4
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

Respond in JSON format:
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
     * Parse AI response into structured format
     */
    parseAIResponse(response, request) {
        try {
            // Extract JSON from response (GPT sometimes includes extra text)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            // Validate parsed response
            const confidence = Math.min(1, Math.max(0, parsed.confidence || 0.5));
            const completionScore = Math.min(100, Math.max(0, parsed.completionScore || 0));
            // If confidence below threshold and verdict is approved, downgrade to needs_review
            if (confidence < this.confidenceThreshold && parsed.verdict === 'approved') {
                console.log('[AIVerification] Downgrading verdict to needs_review due to low confidence');
                parsed.verdict = 'needs_review';
            }
            return {
                jobId: request.jobId,
                verdict: parsed.verdict || 'needs_review',
                confidence,
                completionScore,
                requirementsMet: parsed.requirementsMet || {},
                issues: parsed.issues || [],
                suggestedAction: parsed.suggestedAction || 'refund',
                analysis: parsed.analysis || 'Unable to determine',
                timestamp: Date.now(),
            };
        }
        catch (error) {
            console.error('[AIVerification] Parse error:', error);
            return {
                jobId: request.jobId,
                verdict: 'needs_review',
                confidence: 0,
                completionScore: 0,
                requirementsMet: {},
                issues: [`AI analysis could not be parsed: ${error instanceof Error ? error.message : 'Unknown error'}`],
                suggestedAction: 'refund',
                analysis: 'Could not parse AI response',
                timestamp: Date.now(),
            };
        }
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
        return query.docs[0].data();
    }
    /**
     * Get verification statistics
     */
    async getVerificationStats() {
        const query = await this.db.collection('verification_results').get();
        let approved = 0, rejected = 0, needsReview = 0;
        let totalConfidence = 0, totalScore = 0;
        query.forEach((doc) => {
            const result = doc.data();
            switch (result.verdict) {
                case 'approved':
                    approved++;
                    break;
                case 'rejected':
                    rejected++;
                    break;
                case 'needs_review':
                    needsReview++;
                    break;
            }
            totalConfidence += result.confidence;
            totalScore += result.completionScore;
        });
        const total = query.size;
        return {
            total,
            approved,
            rejected,
            needsReview,
            averageConfidence: total > 0 ? totalConfidence / total : 0,
            averageCompletionScore: total > 0 ? totalScore / total : 0,
        };
    }
}
exports.AIVerificationService = AIVerificationService;
