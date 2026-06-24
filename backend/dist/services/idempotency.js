"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyService = void 0;
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = __importDefault(require("crypto"));
const IDEMPOTENCY_TTL_HOURS = 24;
class IdempotencyService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Generate a deterministic hash from request data
     */
    generateRequestHash(data) {
        const jsonString = JSON.stringify(data);
        return crypto_1.default.createHash('sha256').update(jsonString).digest('hex');
    }
    /**
     * Check if an idempotent request has already been processed
     */
    async getResult(idempotencyKey) {
        try {
            const doc = await this.db.collection('idempotency_keys').doc(idempotencyKey).get();
            if (!doc.exists) {
                return { found: false };
            }
            const data = doc.data();
            // Check if key has expired
            if (data.expiresAt.toDate() < new Date()) {
                await doc.ref.delete();
                return { found: false };
            }
            return { found: true, result: data.result };
        }
        catch (error) {
            console.error('[Idempotency] Error retrieving result:', error);
            throw error;
        }
    }
    /**
     * Store the result of an idempotent operation
     */
    async storeResult(idempotencyKey, requestData, result) {
        try {
            const now = firestore_1.Timestamp.now();
            const expiresAt = firestore_1.Timestamp.fromDate(new Date(now.toDate().getTime() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000));
            const requestHash = this.generateRequestHash(requestData);
            const idempotencyRecord = {
                key: idempotencyKey,
                requestHash,
                result,
                createdAt: now,
                expiresAt,
            };
            await this.db.collection('idempotency_keys').doc(idempotencyKey).set(idempotencyRecord);
        }
        catch (error) {
            console.error('[Idempotency] Error storing result:', error);
            throw error;
        }
    }
    /**
     * Verify that request data matches what was originally stored
     */
    async verifyRequest(idempotencyKey, currentRequestData) {
        try {
            const doc = await this.db.collection('idempotency_keys').doc(idempotencyKey).get();
            if (!doc.exists) {
                return false;
            }
            const data = doc.data();
            const currentHash = this.generateRequestHash(currentRequestData);
            return data.requestHash === currentHash;
        }
        catch (error) {
            console.error('[Idempotency] Error verifying request:', error);
            throw error;
        }
    }
    /**
     * Delete expired idempotency keys (cleanup job)
     */
    async cleanupExpiredKeys() {
        try {
            const now = firestore_1.Timestamp.now();
            const snapshot = await this.db
                .collection('idempotency_keys')
                .where('expiresAt', '<', now)
                .limit(1000)
                .get();
            const batch = this.db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            return snapshot.docs.length;
        }
        catch (error) {
            console.error('[Idempotency] Error cleaning up expired keys:', error);
            throw error;
        }
    }
}
exports.IdempotencyService = IdempotencyService;
