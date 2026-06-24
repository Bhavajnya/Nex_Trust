import { useEffect, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'customer' | 'worker';
  trustScore: number;
  accountStatus: 'active' | 'suspended' | 'banned';
  createdAt: string;
  phone?: string;
  bio?: string;
  skills?: string[];
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
    isAuthenticated: false,
  });

  // Listen to auth state changes
  useEffect(() => {
    if (!auth) {
      // Firebase not initialized (no API key) - set loading false to allow UI to render
      setState((prev) => ({ ...prev, loading: false }));
      console.warn('[useAuth] Firebase not initialized - authentication disabled');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // User is logged in, try to fetch profile from Firestore
          let profile: UserProfile | null = null;
          if (db) {
            try {
              const profileDoc = await getDoc(doc(db, 'users', user.uid));
              profile = profileDoc.data() as UserProfile | undefined || null;
              if (profile) {
                console.log('[useAuth] Profile loaded:', { uid: user.uid, role: profile.role });
              } else {
                console.warn('[useAuth] No profile document found for user:', user.uid);
              }
            } catch (profileErr) {
              // Profile fetch failed (offline, doesn't exist, etc.) - allow user to proceed
              console.warn('[useAuth] Could not fetch profile, proceeding without it:', profileErr);
              // Create a minimal profile so user can still navigate
              profile = null;
            }
          }

          setState({
            user,
            profile,
            loading: false,
            error: null,
            isAuthenticated: true,
          });
        } else {
          // User is logged out
          setState({
            user: null,
            profile: null,
            loading: false,
            error: null,
            isAuthenticated: false,
          });
        }
      } catch (err) {
        console.error('[useAuth] Error in auth state change:', err);
        setState({
          user: null,
          profile: null,
          loading: false,
          error: (err as Error).message,
          isAuthenticated: false,
        });
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Register new user with email and password
   */
  const register = useCallback(
    async (email: string, password: string, name: string, role: 'customer' | 'worker') => {
      try {
        if (!auth) {
          return { success: false, error: 'Firebase not initialized - provide API keys' };
        }

        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Call backend to register user (creates both Firebase Auth user and Firestore profile)
        console.log('[useAuth] Calling backend register:', { email, name, role });
        const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        console.log('[useAuth] Backend URL:', backendUrl);

        let response;
        try {
          response = await fetch(`${backendUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role }),
          });
        } catch (fetchErr: any) {
          console.error('[useAuth] Fetch failed:', fetchErr.message);
          const errMsg = `Failed to connect to backend at ${backendUrl}. Is the backend running on port 3001?`;
          console.error('[useAuth] Detailed error:', errMsg, fetchErr);
          return { success: false, error: errMsg };
        }

        console.log('[useAuth] Backend response status:', response.status);

        if (!response.ok) {
          let errorData: any = {};
          try {
            errorData = await response.json();
          } catch (e) {
            console.warn('[useAuth] Could not parse error response as JSON');
          }
          const errMsg = errorData.error || errorData.message || `Backend error: ${response.statusText}`;
          console.error('[useAuth] Backend error:', errMsg, errorData);
          return { success: false, error: errMsg };
        }

        let data;
        try {
          data = await response.json();
        } catch (parseErr: any) {
          console.error('[useAuth] Could not parse response as JSON:', parseErr);
          return { success: false, error: 'Backend returned invalid response' };
        }

        console.log('[useAuth] Backend response:', data);

        // After backend creates the user, sign them in with Firebase client
        // Don't call createUserWithEmailAndPassword again - backend already created the user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch profile from Firestore to ensure we have the role
        let profile: UserProfile | null = null;
        if (db) {
          try {
            const profileDoc = await getDoc(doc(db, 'users', user.uid));
            profile = profileDoc.data() as UserProfile | undefined || null;
            console.log('[useAuth] Profile loaded after registration:', { uid: user.uid, role: profile?.role });
          } catch (profileErr) {
            console.warn('[useAuth] Could not fetch profile after registration:', profileErr);
            // Create a fallback profile
            profile = {
              uid: user.uid,
              email,
              name,
              role,
              trustScore: 50,
              accountStatus: 'active',
              createdAt: new Date().toISOString(),
              phone: '',
              bio: '',
              skills: [],
            };
          }
        }

        setState((prev) => ({
          ...prev,
          user,
          profile,
          loading: false,
          isAuthenticated: true,
        }));

        return { success: true, user, profile };
      } catch (err) {
        const errorMessage = (err as Error).message;
        console.error('[useAuth] Registration error:', errorMessage);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
        return { success: false, error: errorMessage };
      }
    },
    [db]
  );

  /**
   * Login with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    try {
      if (!auth) {
        const msg = 'Firebase not initialized - check VITE_FIREBASE_* environment variables';
        console.error('[useAuth]', msg);
        return { success: false, error: msg };
      }

      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      console.log('[useAuth] Starting login for email:', email);
      setState((prev) => ({ ...prev, loading: true, error: null }));

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('[useAuth] Firebase login successful for user:', userCredential.user.uid);
      } catch (firebaseErr: any) {
        const errMsg = firebaseErr.code === 'auth/user-not-found'
          ? 'User not found. Please check your email or sign up first.'
          : firebaseErr.code === 'auth/wrong-password'
          ? 'Incorrect password. Please try again.'
          : firebaseErr.code === 'auth/invalid-email'
          ? 'Invalid email address.'
          : `Firebase Auth Error (${firebaseErr.code}): ${firebaseErr.message}`;

        console.error('[useAuth] Firebase login error:', firebaseErr);
        return { success: false, error: errMsg };
      }

      const user = userCredential.user;

      // Get ID token to send to backend
      const idToken = await user.getIdToken();
      console.log('[useAuth] Got ID token for user:', user.uid);

      // Fetch user profile from Firestore
      let profile: UserProfile | null = null;
      if (db) {
        try {
          console.log('[useAuth] Fetching profile from Firestore for user:', user.uid);
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            profile = profileDoc.data() as UserProfile;
            console.log('[useAuth] Profile found:', { uid: profile.uid, role: profile.role });
          } else {
            console.warn('[useAuth] No profile document found for user:', user.uid);
          }
        } catch (profileErr: any) {
          console.warn('[useAuth] Could not fetch profile on login:', profileErr);
          // Continue without profile - user is still authenticated
        }
      } else {
        console.warn('[useAuth] Firestore not initialized');
      }

      setState((prev) => ({
        ...prev,
        user,
        profile,
        loading: false,
        isAuthenticated: true,
        error: null,
      }));

      console.log('[useAuth] Login successful, returning user and profile');
      return { success: true, user, idToken, profile };
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown login error';
      console.error('[useAuth] Login exception:', err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [db]);

  /**
   * Logout current user
   */
  const logout = useCallback(async () => {
    try {
      if (!auth) {
        return { success: false, error: 'Firebase not initialized - provide API keys' };
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));
      await signOut(auth);
      setState({
        user: null,
        profile: null,
        loading: false,
        error: null,
        isAuthenticated: false,
      });
      return { success: true };
    } catch (err) {
      const errorMessage = (err as Error).message;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, []);

  /**
   * Get fresh ID token (for API calls)
   */
  const getIdToken = useCallback(async () => {
    try {
      if (!state.user) {
        return null;
      }
      return await state.user.getIdToken();
    } catch (err) {
      console.error('[useAuth] Error getting ID token:', err);
      return null;
    }
  }, [state.user]);

  return {
    ...state,
    register,
    login,
    logout,
    getIdToken,
  };
}
