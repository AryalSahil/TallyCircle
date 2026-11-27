import React, { useEffect, useState } from 'react';
import {
  ReceiptIndianRupee,
  Mail,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { AUTH_EDITORIAL_IMAGE } from '../utils/helpers';
import { Button, InputField } from '../components/ui/Primitives';

type AuthMode = 'signin' | 'signup' | 'forgot';

interface ParsedAuthError {
  code: string;
  message: string;
  isUnauthorizedDomain: boolean;
}

function parseAuthError(err: unknown, currentHost: string): ParsedAuthError {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      isUnauthorizedDomain: true,
      message: `The current domain (${currentHost || 'unknown host'}) is not yet authorized for Firebase Authentication.`,
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      isUnauthorizedDomain: false,
      message:
        'This sign-in method is not enabled in Firebase Authentication > Sign-in method yet.',
    };
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'Incorrect email or password.',
    };
  }
  if (code === 'auth/email-already-in-use') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'An account with this email already exists.',
    };
  }
  if (code === 'auth/weak-password') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'Password must be at least 6 characters.',
    };
  }
  if (code === 'auth/popup-closed-by-user') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'Google sign-in window was closed before completing.',
    };
  }
  if (code === 'auth/cancelled-popup-request') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'A previous Google sign-in window is already open. Complete or close it first.',
    };
  }
  if (code === 'auth/popup-blocked') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'Sign-in popup was blocked by your browser. Redirecting or allow popups for this site.',
    };
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'An account already exists with this email using email/password sign-in.',
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'Network error while contacting Firebase Authentication. Check your connection and retry.',
    };
  }
  if (code === 'auth/too-many-requests') {
    return {
      code,
      isUnauthorizedDomain: false,
      message: 'Too many sign-in attempts. Please wait a moment and try again.',
    };
  }
  return {
    code,
    isUnauthorizedDomain: false,
    message: err instanceof Error ? err.message : 'Authentication failed.',
  };
}

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
    redirectAuthError,
    clearRedirectAuthError,
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
  const [authAlert, setAuthAlert] = useState<ParsedAuthError | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);

  const currentHost =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const pendingInviteKind = (() => {
    if (typeof window === 'undefined') return null;
    const currentPath = window.location.pathname;
    let storedPath = '';
    try {
      storedPath = sessionStorage.getItem('tallycircle_pending_invite_path') || '';
    } catch {
      storedPath = '';
    }
    const effectivePath = currentPath.startsWith('/join/') ? currentPath : storedPath;
    if (effectivePath.startsWith('/join/group/')) return 'group' as const;
    if (effectivePath.startsWith('/join/friend/')) return 'friend' as const;
    return null;
  })();

  useEffect(() => {
    if (!redirectAuthError) return;
    const parsed = parseAuthError(redirectAuthError, currentHost);
    setAuthAlert(parsed);
    showToast('Google sign-in failed', { description: parsed.message, variant: 'error' });
    clearRedirectAuthError();
  }, [redirectAuthError, currentHost, showToast, clearRedirectAuthError]);

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      showToast('Copy failed', { variant: 'error' });
    }
  };

  const handleGoogle = async () => {
    setAuthAlert(null);
    setGoogleLoading(true);
    try {
      const flow = await signInWithGoogle();
      if (flow === 'redirect') {
        showToast('Redirecting to Google sign-in...', { variant: 'info' });
      }
    } catch (err) {
      const parsed = parseAuthError(err, currentHost);
      setAuthAlert(parsed);
      showToast('Google sign-in failed', { description: parsed.message, variant: 'error' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthAlert(null);
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
      const parsed = parseAuthError(err, currentHost);
      setAuthAlert(parsed);
      showToast('Authentication error', { description: parsed.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (needsEmailVerification && firebaseUser) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Verify your email address
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              We sent a verification link to{' '}
              <span className="font-medium text-slate-900 dark:text-white break-all">
                {firebaseUser.email}
              </span>
              . Click the link in your inbox, then press continue below.
            </p>
            {pendingInviteKind && (
              <p className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                After verifying your email, you will be redirected directly back to accept your {pendingInviteKind} invitation.
              </p>
            )}
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
                    description: parseAuthError(err, currentHost).message,
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
    <div className="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-2 bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center justify-center px-4 py-8 sm:p-10">
        <div className="w-full max-w-md space-y-5 sm:space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0">
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

          {pendingInviteKind && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 p-3.5 flex items-start gap-2.5">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                You have a pending {pendingInviteKind === 'group' ? 'group' : 'friend'} invitation. Sign in or create an account and we&apos;ll take you right back to join.
              </p>
            </div>
          )}

          {authAlert && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-3.5 text-xs text-red-800 dark:text-red-200 space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{authAlert.message}</p>
              </div>
              {authAlert.isUnauthorizedDomain && currentHost && (
                <div className="pt-1 pl-6 space-y-2">
                  <p className="text-[11px] text-red-700 dark:text-red-300">
                    Add this hostname in Firebase Console → Authentication → Settings → Authorized domains:
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 dark:border-red-800/80 bg-white dark:bg-slate-900 px-2.5 py-1.5">
                    <code className="font-mono-nums text-[11px] text-slate-900 dark:text-slate-100 truncate">
                      {currentHost}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyHost}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline shrink-0 cursor-pointer"
                    >
                      {copiedHost ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedHost ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full min-h-[44px]"
            loading={googleLoading}
            disabled={loading}
            onClick={handleGoogle}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
            {googleLoading ? 'Signing in with Google...' : 'Continue with Google'}
          </Button>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
            <span className="px-3 text-xs text-slate-400">or with email</span>
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <InputField
                label="Full name"
                type="text"
                placeholder="Aman Verma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
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

            <Button
              type="submit"
              size="lg"
              className="w-full min-h-[44px]"
              loading={loading}
              disabled={googleLoading}
            >
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
                  onClick={() => {
                    setAuthAlert(null);
                    setMode('signup');
                  }}
                  className="py-1.5 hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer"
                >
                  New here? Create an account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthAlert(null);
                    setResetSent(false);
                    setMode('forgot');
                  }}
                  className="py-1.5 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthAlert(null);
                  setMode('signin');
                }}
                className="py-1.5 hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer"
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
