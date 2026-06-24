import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { config } from './config';

let db: Firestore;

export function initializeFirebase(): Firestore {
  if (db) {
    return db;
  }

  try {
    // Validate required Firebase config
    if (!config.firebaseProjectId) {
      throw new Error('FIREBASE_PROJECT_ID is required');
    }
    if (!config.firebasePrivateKey) {
      throw new Error('FIREBASE_PRIVATE_KEY is required');
    }
    if (!config.firebaseClientEmail) {
      throw new Error('FIREBASE_CLIENT_EMAIL is required');
    }

    console.log('[Firebase] Initializing with project:', config.firebaseProjectId);

    initializeApp({
      credential: cert({
        projectId: config.firebaseProjectId,
        privateKeyId: config.firebasePrivateKeyId,
        privateKey: config.firebasePrivateKey,
        clientEmail: config.firebaseClientEmail,
        clientId: config.firebaseClientId,
        authUri: config.firebaseAuthUri,
        tokenUri: config.firebaseTokenUri,
      } as ServiceAccount),
    });

    db = getFirestore();

    // Enable offline persistence for better reliability
    db.settings({
      ignoreUndefinedProperties: true,
    });

    console.log('[Firebase] Initialized successfully with project:', config.firebaseProjectId);
    return db;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Firebase] Initialization error:', errorMsg);
    console.error('[Firebase] Check that FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL are set');
    throw error;
  }
}

export function getDb(): Firestore {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  return db;
}

export { db };
