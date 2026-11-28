import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  User,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { CurrencyCode, ThemePreference, UserPrivateProfile } from '../types';
import { clearPublicProfileCache, ensureUserProfile, updateUserProfile } from '../services/userService';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserPrivateProfile | null;
  loading: boolean;
  needsEmailVerification: boolean;
  redirectAuthError: unknown;
  clearRedirectAuthError: () => void;
  signInWithGoogle: () => Promise<'popup' | 'redirect'>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (fullName: string, email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  updateMyProfile: (updates: {
    fullName?: string;
    phone?: string;
    upiId?: string;
    photoUrl?: string;
    handle?: string;
    theme?: ThemePreference;
    preferredCurrency?: CurrencyCode;
    customTags?: string[];
  }) => Promise<UserPrivateProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPrivateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectAuthError, setRedirectAuthError] = useState<unknown>(null);
  const [, setVerificationTick] = useState(0);

  useEffect(() => {
    let active = true;

    getRedirectResult(auth)
      .then(async (result) => {
        if (!active || !result?.user) return;
        setFirebaseUser(result.user);
        if (result.user.emailVerified) {
          const p = await ensureUserProfile(result.user);
          if (active) setProfile(p);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('Google redirect sign-in error:', err);
        setRedirectAuthError(err);
      });

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        try {
          const p = await ensureUserProfile(user);
          if (active) setProfile(p);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
          if (active) setProfile(null);
        }
      } else {
        setProfile(null);
      }
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  const needsEmailVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);

  const clearRedirectAuthError = useCallback(() => {
    setRedirectAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<'popup' | 'redirect'> => {
    setRedirectAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      setFirebaseUser(cred.user);
      if (cred.user.emailVerified) {
        const p = await ensureUserProfile(cred.user);
        setProfile(p);
      }
      return 'popup';
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      // Fallback to redirect when popups are blocked or restricted (e.g., mobile in-app browsers)
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, googleAuthProvider);
        return 'redirect';
      }
      throw err;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setRedirectAuthError(null);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    setFirebaseUser(cred.user);
    if (cred.user.emailVerified) {
      const p = await ensureUserProfile(cred.user);
      setProfile(p);
    }
  }, []);

  const signUpWithEmail = useCallback(async (fullName: string, email: string, password: string) => {
    setRedirectAuthError(null);
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: fullName.trim() });
    await sendEmailVerification(cred.user);
    setFirebaseUser(cred.user);
    setVerificationTick((t) => t + 1);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No active user session.');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshVerificationStatus = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const refreshed = auth.currentUser;
    setFirebaseUser(refreshed);
    setVerificationTick((t) => t + 1);
    if (refreshed?.emailVerified) {
      const p = await ensureUserProfile(refreshed);
      setProfile(p);
      return true;
    }
    return false;
  }, []);

  const updateMyProfile = useCallback(
    async (updates: {
      fullName?: string;
      phone?: string;
      upiId?: string;
      photoUrl?: string;
      handle?: string;
      theme?: ThemePreference;
      preferredCurrency?: CurrencyCode;
      customTags?: string[];
    }) => {
      if (!profile) throw new Error('Profile not loaded yet.');
      const updated = await updateUserProfile(profile, updates);
      setProfile(updated);
      return updated;
    },
    [profile]
  );

  const logout = useCallback(async () => {
    clearPublicProfileCache();
    await signOut(auth);
    setProfile(null);
    setFirebaseUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      loading,
      needsEmailVerification,
      redirectAuthError,
      clearRedirectAuthError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      resendVerification,
      refreshVerificationStatus,
      updateMyProfile,
      logout,
    }),
    [
      firebaseUser,
      profile,
      loading,
      needsEmailVerification,
      redirectAuthError,
      clearRedirectAuthError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      resendVerification,
      refreshVerificationStatus,
      updateMyProfile,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
