import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { AppDataProvider } from './contexts/AppDataContext';
import { PublicLayout } from './components/layout/PublicLayout';
import { AppShell } from './components/layout/AppShell';
import { AuthPage } from './pages/AuthPage';
import { ExpenseFormModal } from './components/modals/ExpenseFormModal';
import { HomePage } from './pages/public/HomePage';
import { FeaturesPage } from './pages/public/FeaturesPage';
import { HowItWorksPage } from './pages/public/HowItWorksPage';
import { AboutPage } from './pages/public/AboutPage';
import { FaqPage } from './pages/public/FaqPage';
import { ContactPage } from './pages/public/ContactPage';
import { PrivacyPage } from './pages/public/PrivacyPage';
import { TermsPage } from './pages/public/TermsPage';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const GroupsPage = lazy(() =>
  import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage }))
);
const GroupDetailPage = lazy(() =>
  import('./pages/GroupDetailPage').then((m) => ({ default: m.GroupDetailPage }))
);
const FriendsPage = lazy(() =>
  import('./pages/FriendsPage').then((m) => ({ default: m.FriendsPage }))
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const InviteJoinPage = lazy(() =>
  import('./pages/InviteJoinPage').then((m) => ({ default: m.InviteJoinPage }))
);
const TripsPage = lazy(() =>
  import('./pages/TripsPage').then((m) => ({ default: m.TripsPage }))
);
const TripDetailPage = lazy(() =>
  import('./pages/TripDetailPage').then((m) => ({ default: m.TripDetailPage }))
);
const ExpensesPage = lazy(() =>
  import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
      <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-slate-500 dark:text-slate-400">Loading view...</p>
    </div>
  );
}

const PENDING_INVITE_KEY = 'tallycircle_pending_invite_path';

function normalizeInvitePath(pathname: string, search = ''): string | null {
  const clean = pathname.startsWith('/app/join/')
    ? pathname
    : pathname.startsWith('/join/')
      ? `/app${pathname}`
      : null;
  if (!clean) return null;
  if (
    clean.startsWith('/app/join/group/') ||
    clean.startsWith('/app/join/trip/') ||
    clean.startsWith('/app/join/friend/')
  ) {
    return `${clean}${search}`;
  }
  return null;
}

function savePendingInvite(fullAppPath: string) {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, fullAppPath);
  } catch {
    // Ignore storage restrictions
  }
}

function consumePendingInvite(): string | null {
  try {
    const saved = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!saved) return null;
    const [pathname, rawSearch] = saved.split('?');
    const normalized = normalizeInvitePath(pathname, rawSearch ? `?${rawSearch}` : '');
    if (normalized) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      return normalized;
    }
  } catch {
    // Ignore storage restrictions
  }
  return null;
}

function LegacyParamRedirect({ basePath, paramName }: { basePath: string; paramName: string }) {
  const params = useParams();
  const value = params[paramName] || '';
  return <Navigate to={`${basePath}/${encodeURIComponent(value)}`} replace />;
}

function PublicInviteBridge() {
  const { firebaseUser, profile, loading, needsEmailVerification } = useAuth();
  const location = useLocation();
  const normalized = normalizeInvitePath(location.pathname, location.search);

  useEffect(() => {
    if (normalized) {
      savePendingInvite(normalized);
    }
  }, [normalized]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  const isAuthenticated = Boolean(firebaseUser && !needsEmailVerification && profile);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={normalized || '/app'} replace />;
}

function AuthRoute({ initialMode }: { initialMode: 'signin' | 'signup' }) {
  const { firebaseUser, profile, loading, needsEmailVerification } = useAuth();
  const [inviteRedirect] = useState<string | null>(() => {
    const isAuthReady = Boolean(firebaseUser && !needsEmailVerification && profile);
    return isAuthReady ? consumePendingInvite() : null;
  });

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking session...</p>
        </div>
      </div>
    );
  }

  const isAuthenticated = Boolean(firebaseUser && !needsEmailVerification && profile);
  if (isAuthenticated) {
    const pending = inviteRedirect || consumePendingInvite();
    return <Navigate to={pending || '/app'} replace />;
  }

  return <AuthPage initialMode={initialMode} />;
}

function ProtectedAppRoutes() {
  const { firebaseUser, profile, loading, needsEmailVerification } = useAuth();
  const location = useLocation();
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [quickExpenseGroupId, setQuickExpenseGroupId] = useState<string | undefined>(undefined);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  const isAuthenticated = Boolean(firebaseUser && !needsEmailVerification && profile);

  useEffect(() => {
    const normalized = normalizeInvitePath(location.pathname, location.search);
    if (normalized && !isAuthenticated) {
      savePendingInvite(normalized);
    }
  }, [location.pathname, location.search, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const saved = consumePendingInvite();
    if (saved) {
      const current = `${location.pathname}${location.search}`;
      if (current !== saved) {
        setPendingRedirect(saved);
      }
    }
  }, [isAuthenticated, location.pathname, location.search]);

  useEffect(() => {
    if (pendingRedirect && `${location.pathname}${location.search}` === pendingRedirect) {
      setPendingRedirect(null);
    }
  }, [pendingRedirect, location.pathname, location.search]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading your ledger...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (pendingRedirect && `${location.pathname}${location.search}` !== pendingRedirect) {
    return <Navigate to={pendingRedirect} replace />;
  }

  const openQuickExpense = (groupId?: string) => {
    setQuickExpenseGroupId(groupId);
    setQuickExpenseOpen(true);
  };

  return (
    <AppDataProvider>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route element={<AppShell onQuickAddExpense={() => openQuickExpense()} />}>
            <Route index element={<DashboardPage onAddExpense={openQuickExpense} />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/:groupId" element={<GroupDetailPage />} />
            <Route path="trips" element={<TripsPage />} />
            <Route path="trips/:tripId" element={<TripDetailPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="join/group/:token" element={<InviteJoinPage kind="group" />} />
            <Route path="join/trip/:token" element={<InviteJoinPage kind="trip" />} />
            <Route path="join/friend/:token" element={<InviteJoinPage kind="friend" />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
        </Routes>
      </Suspense>

      <ExpenseFormModal
        open={quickExpenseOpen}
        onClose={() => setQuickExpenseOpen(false)}
        defaultGroupId={quickExpenseGroupId}
      />
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <CurrencyProvider>
              <BrowserRouter>
                <Routes>
                  {/* Public Website Routes */}
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/features" element={<FeaturesPage />} />
                    <Route path="/how-it-works" element={<HowItWorksPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/faq" element={<FaqPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                  </Route>

                  {/* Auth Routes */}
                  <Route path="/login" element={<AuthRoute initialMode="signin" />} />
                  <Route path="/register" element={<AuthRoute initialMode="signup" />} />

                  {/* Invite Deep Links (preserve pre-auth destination & forward into /app/join/...) */}
                  <Route path="/join/group/:token" element={<PublicInviteBridge />} />
                  <Route path="/join/trip/:token" element={<PublicInviteBridge />} />
                  <Route path="/join/friend/:token" element={<PublicInviteBridge />} />

                  {/* Protected User Ledger Application */}
                  <Route path="/app/*" element={<ProtectedAppRoutes />} />

                  {/* Legacy App Path Redirects */}
                  <Route path="/groups" element={<Navigate to="/app/groups" replace />} />
                  <Route path="/groups/:groupId" element={<LegacyParamRedirect basePath="/app/groups" paramName="groupId" />} />
                  <Route path="/trips" element={<Navigate to="/app/trips" replace />} />
                  <Route path="/trips/:tripId" element={<LegacyParamRedirect basePath="/app/trips" paramName="tripId" />} />
                  <Route path="/expenses" element={<Navigate to="/app/expenses" replace />} />
                  <Route path="/friends" element={<Navigate to="/app/friends" replace />} />
                  <Route path="/analytics" element={<Navigate to="/app/analytics" replace />} />
                  <Route path="/notifications" element={<Navigate to="/app/notifications" replace />} />
                  <Route path="/profile" element={<Navigate to="/app/profile" replace />} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </CurrencyProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
