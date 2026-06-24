import { Firestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { IdempotencyKey } from '../types';

const IDEMPOTENCY_TTL_HOURS = 24;

export class IdempotencyService {
  constructor(private db: Firestore) {}

  /**
   * Generate a deterministic hash from request data
   */
  private generateRequestHash(data: unknown): string {
    const jsonString = JSON.stringify(data);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  }

  /**
   * Check if an idempotent request has already been processed
   */
  async getResult(idempotencyKey: string): Promise<{ found: boolean; result?: unknown }> {
    try {
      const doc = await this.db.collection('idempotency_keys').doc(idempotencyKey).get();

      if (!doc.exists) {
        return { found: false };
      }

      const data = doc.data() as IdempotencyKey;

      // Check if key has expired
      if (data.expiresAt.toDate() < new Date()) {
        await doc.ref.delete();
        return { found: false };
      }

      return { found: true, result: data.result };
    } catch (error) {
      console.error('[Idempotency] Error retrieving result:', error);
      throw error;
    }
  }

  /**
   * Store the result of an idempotent operation
   */
  async storeResult(
    idempotencyKey: string,
    requestData: unknown,
    result: unknown
  ): Promise<void> {
    try {
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromDate(
        new Date(now.toDate().getTime() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000)
      );

      const requestHash = this.generateRequestHash(requestData);

      const idempotencyRecord: IdempotencyKey = {
        key: idempotencyKey,
        requestHash,
        result,
        createdAt: now,
        expiresAt,
      };

      await this.db.collection('idempotency_keys').doc(idempotencyKey).set(idempotencyRecord);
    } catch (error) {
      console.error('[Idempotency] Error storing result:', error);
      throw error;
    }
  }

  /**
   * Verify that request data matches what was originally stored
   */
  async verifyRequest(idempotencyKey: string, currentRequestData: unknown): Promise<boolean> {
    try {
      const doc = await this.db.collection('idempotency_keys').doc(idempotencyKey).get();

      if (!doc.exists) {
        return false;
      }

      const data = doc.data() as IdempotencyKey;
      const currentHash = this.generateRequestHash(currentRequestData);

      return data.requestHash === currentHash;
    } catch (error) {
      console.error('[Idempotency] Error verifying request:', error);
      throw error;
    }
  }

  /**
   * Delete expired idempotency keys (cleanup job)
   */
  async cleanupExpiredKeys(): Promise<number> {
    try {
      const now = Timestamp.now();
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
    } catch (error) {
      console.error('[Idempotency] Error cleaning up expired keys:', error);
      throw error;
    }
  }
}
