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
          // User is logged in, fetch profile from Firestore
          if (db) {
            const profileDoc = await getDoc(doc(db, 'users', user.uid));
            const profile = profileDoc.data() as UserProfile | undefined;

            setState({
              user,
              profile: profile || null,
              loading: false,
              error: null,
              isAuthenticated: true,
            });
          } else {
            setState({
              user,
              profile: null,
              loading: false,
              error: null,
              isAuthenticated: true,
            });
          }
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
        console.error('[useAuth] Error fetching profile:', err);
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

        // Create Firebase auth user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create user profile in Firestore
        const userProfile: UserProfile = {
          uid: user.uid,
          email,
          name,
          role,
          trustScore: 50, // Initial trust score
          accountStatus: 'active',
          createdAt: new Date().toISOString(),
          phone: '',
          bio: '',
          skills: [],
        };

        if (db) {
          await setDoc(doc(db, 'users', user.uid), userProfile);
        }

        setState((prev) => ({
          ...prev,
          user,
          profile: userProfile,
          loading: false,
          isAuthenticated: true,
        }));

        return { success: true, user };
      } catch (err) {
        const errorMessage = (err as Error).message;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  /**
   * Login with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    try {
      if (!auth) {
        return { success: false, error: 'Firebase not initialized - provide API keys' };
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get ID token to send to backend
      const idToken = await user.getIdToken();

      setState((prev) => ({
        ...prev,
        loading: false,
        isAuthenticated: true,
      }));

      return { success: true, user, idToken };
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
