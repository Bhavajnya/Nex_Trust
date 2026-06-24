import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Validate that all required env vars are present
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

if (!apiKey || !authDomain || !projectId) {
  console.error('[Firebase] CRITICAL: Missing Firebase environment variables!');
  console.error('Required:', { apiKey: !!apiKey, authDomain: !!authDomain, projectId: !!projectId });
  throw new Error(
    'Firebase configuration incomplete. Ensure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, and VITE_FIREBASE_PROJECT_ID are set in .env.local'
  );
}

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

console.log('[Firebase] Initializing with config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  apiKey: firebaseConfig.apiKey.substring(0, 20) + '...',
});

// Initialize Firebase
let app;
let auth;
let db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  console.log('[Firebase] Auth initialized for:', firebaseConfig.authDomain);
  console.log('[Firebase] Firestore initialized for project:', firebaseConfig.projectId);

  // Development: Connect to emulator if enabled
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
      console.log('[Firebase] Connected to emulators (DEV MODE)');
    } catch (e) {
      console.log('[Firebase] Emulators already connected or not available');
    }
  }
} catch (error) {
  console.error('[Firebase] Critical initialization error:', error);
  throw error;
}

export { auth, db, app };
export default app;
