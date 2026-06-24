/**
 * Firebase Diagnostic Utilities
 * Run these checks to verify Firebase is properly configured
 */

export function checkFirebaseConfig() {
  const checks = {
    'VITE_FIREBASE_API_KEY': import.meta.env.VITE_FIREBASE_API_KEY,
    'VITE_FIREBASE_AUTH_DOMAIN': import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    'VITE_FIREBASE_PROJECT_ID': import.meta.env.VITE_FIREBASE_PROJECT_ID,
    'VITE_FIREBASE_STORAGE_BUCKET': import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    'VITE_FIREBASE_MESSAGING_SENDER_ID': import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    'VITE_FIREBASE_APP_ID': import.meta.env.VITE_FIREBASE_APP_ID,
  };

  console.log('=== FIREBASE CONFIGURATION CHECK ===');
  let allPresent = true;
  
  Object.entries(checks).forEach(([key, value]) => {
    const isPresent = !!value;
    const display = isPresent ? `✅ ${value.substring(0, 20)}...` : '❌ MISSING';
    console.log(`${key}: ${display}`);
    if (!isPresent) allPresent = false;
  });

  console.log('====================================');
  
  if (allPresent) {
    console.log('✅ All Firebase environment variables are configured!');
  } else {
    console.error('❌ Some Firebase environment variables are missing.');
    console.error('Please check your frontend/.env.local file');
  }

  return allPresent;
}

export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

// Call this to diagnose issues
if (typeof window !== 'undefined') {
  (window as any).checkFirebaseConfig = checkFirebaseConfig;
  (window as any).getFirebaseConfig = getFirebaseConfig;
}
