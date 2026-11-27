import React, { useState } from 'react';
import { ReceiptIndianRupee, Mail, Lock, User, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { AUTH_EDITORIAL_IMAGE } from '../utils/helpers';
import { Button, InputField } from '../components/ui/Primitives';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function AuthPage() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    needsEmailVerification,
    firebaseUser,
    resendVerification,
    refreshVerificationStatus,
    logout,
  } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      return 'Email/password sign-in is not enabled in Firebase Console yet. Enable it under Authentication > Sign-in method, or use Google Sign-In above.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Incorrect email or password.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in window was closed before completing.';
    }
    return err instanceof Error ? err.message : 'Authentication failed.';
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      showToast('Google sign-in failed', { description: mapAuthError(err), variant: 'error' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else if (mode === 'signup') {
        if (!fullName.trim()) {
          showToast('Enter your full name', { variant: 'error' });
          setLoading(false);
          return;
        }
        await signUpWithEmail(fullName, email, password);
        showToast('Verification email sent', {
          description: 'Please verify your email address before continuing.',
          variant: 'success',
        });
      } else {
        await sendPasswordReset(email);
        setResetSent(true);
        showToast('Password reset link sent', {
          description: 'Check your inbox to reset your password.',
          variant: 'success',
        });
      }
    } catch (err) {
      showToast('Authentication error', { description: mapAuthError(err), variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (needsEmailVerification && firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Verify your email address
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-medium text-slate-900 dark:text-white">
                {firebaseUser.email}
              </span>
              . Click the link in your inbox, then press continue below.
            </p>
          </div>
          <div className="space-y-2.5 pt-1">
            <Button
              className="w-full"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const ok = await refreshVerificationStatus();
                  if (!ok) {
                    showToast('Email not verified yet', {
                      description: 'Open the verification link sent to your email first.',
                      variant: 'info',
                    });
                  }
                } finally {
                  setLoading(false);
                }
              }}
            >
              <CheckCircle2 className="w-4 h-4" />
              I&apos;ve Verified — Continue
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await resendVerification();
                  showToast('Verification email resent', { variant: 'success' });
                } catch (err) {
                  showToast('Could not resend email', {
                    description: mapAuthError(err),
                    variant: 'error',
                  });
                }
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Resend Verification Email
            </Button>
            <Button variant="ghost" className="w-full" onClick={logout}>
              Sign out and switch account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950">
              <ReceiptIndianRupee className="w-5 h-5" />
            </div>
            <span className="font-display text-xl font-bold text-slate-900 dark:text-white">
              TallyCircle
            </span>
          </div>

          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {mode === 'signin'
                ? 'Welcome back to your shared ledger'
                : mode === 'signup'
                  ? 'Create your TallyCircle account'
                  : 'Reset your password'}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Split group bills with paise precision, simplify debts, and track UPI or cash settlements.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            loading={googleLoading}
            onClick={handleGoogle}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
            <span className="px-3 text-xs text-slate-400">or with email</span>
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="relative">
                <InputField
                  label="Full name"
                  type="text"
                  placeholder="Aman Verma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <InputField
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {mode !== 'forgot' && (
              <InputField
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            )}

            {mode === 'forgot' && resetSent && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                If an account exists for that email, a reset link has been sent.
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === 'signin'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Send Reset Link'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
            {mode === 'signin' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer"
                >
                  New here? Create an account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetSent(false);
                    setMode('forgot');
                  }}
                  className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Editorial Right Column */}
      <div className="hidden lg:block relative overflow-hidden bg-slate-900">
        <img
          src={AUTH_EDITORIAL_IMAGE}
          alt="Friends dining together"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white space-y-3 max-w-lg">
          <p className="text-xs font-medium text-emerald-400">
            Transparent Group Finances
          </p>
          <h2 className="font-display text-3xl font-bold leading-tight">
            Every trip, dinner, and outing reconciled to zero.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Log multi-payer bills, split by exact rupees, percentages, or shares, and settle up with built-in UPI QR codes and confirmation tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
