import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { CurrencyCode, UserPrivateProfile } from '../types';
import { ensureUserProfile, updateUserProfile } from '../services/userService';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserPrivateProfile | null;
  loading: boolean;
  needsEmailVerification: boolean;
  signInWithGoogle: () => Promise<void>;
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        try {
          const p = await ensureUserProfile(user);
          setProfile(p);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const needsEmailVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    if (cred.user.emailVerified) {
      const p = await ensureUserProfile(cred.user);
      setProfile(p);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (cred.user.emailVerified) {
      const p = await ensureUserProfile(cred.user);
      setProfile(p);
    }
  };

  const signUpWithEmail = async (fullName: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: fullName.trim() });
    await sendEmailVerification(cred.user);
    setFirebaseUser({ ...cred.user });
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const resendVerification = async () => {
    if (!auth.currentUser) throw new Error('No active user session.');
    await sendEmailVerification(auth.currentUser);
  };

  const refreshVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const refreshed = auth.currentUser;
    setFirebaseUser(refreshed ? ({ ...refreshed } as User) : null);
    if (refreshed?.emailVerified) {
      const p = await ensureUserProfile(refreshed);
      setProfile(p);
      return true;
    }
    return false;
  };

  const updateMyProfile = async (updates: {
    fullName?: string;
    phone?: string;
    upiId?: string;
    photoUrl?: string;
    handle?: string;
    preferredCurrency?: CurrencyCode;
    customTags?: string[];
  }) => {
    if (!profile) throw new Error('Profile not loaded yet.');
    const updated = await updateUserProfile(profile, updates);
    setProfile(updated);
    return updated;
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        needsEmailVerification,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        resendVerification,
        refreshVerificationStatus,
        updateMyProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
