import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDxF6b8K9L2M3N4O5P6Q7R8S9T0U1V2W3X',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'magic-handshake-dev.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'magic-handshake-dev',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'magic-handshake-dev.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abcdef1234567890',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth and get a reference to the service
let auth;
let db;

try {
  auth = getAuth(app);
  db = getFirestore(app);

  // Development: Connect to emulator
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
    } catch (e) {
      // Emulators already connected
    }
  }
} catch (error) {
  console.warn('[Firebase] Initialization failed - using mock services for development:', error instanceof Error ? error.message : error);
  // In development without valid API keys, we'll create placeholder exports
  // These will be replaced when real Firebase credentials are provided
  auth = null as any;
  db = null as any;
}

export { auth, db };
export default app;
