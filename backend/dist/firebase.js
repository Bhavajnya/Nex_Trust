"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeFirebase = initializeFirebase;
exports.getDb = getDb;
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const config_1 = require("./config");
let db;
function initializeFirebase() {
    if (db) {
        return db;
    }
    try {
        (0, app_1.initializeApp)({
            credential: (0, app_1.cert)({
                projectId: config_1.config.firebaseProjectId,
                privateKeyId: config_1.config.firebasePrivateKeyId,
                privateKey: config_1.config.firebasePrivateKey,
                clientEmail: config_1.config.firebaseClientEmail,
                clientId: config_1.config.firebaseClientId,
                authUri: config_1.config.firebaseAuthUri,
                tokenUri: config_1.config.firebaseTokenUri,
            }),
        });
        db = (0, firestore_1.getFirestore)();
        // Enable offline persistence for better reliability
        db.settings({
            ignoreUndefinedProperties: true,
        });
        console.log('[Firebase] Initialized successfully');
        return db;
    }
    catch (error) {
        console.error('[Firebase] Initialization error:', error);
        throw error;
    }
}
function getDb() {
    if (!db) {
        throw new Error('Firebase not initialized');
    }
    return db;
}
