import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { AppDataProvider } from './contexts/AppDataContext';
import { AppShell } from './components/layout/AppShell';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { FriendsPage } from './pages/FriendsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { InviteJoinPage } from './pages/InviteJoinPage';
import { ExpenseFormModal } from './components/modals/ExpenseFormModal';

const PENDING_INVITE_KEY = 'tallycircle_pending_invite_path';

function isInvitePath(pathname: string): boolean {
  return pathname.startsWith('/join/group/') || pathname.startsWith('/join/friend/');
}

function AuthenticatedRouter() {
  const { firebaseUser, profile, loading, needsEmailVerification } = useAuth();
  const location = useLocation();
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [quickExpenseGroupId, setQuickExpenseGroupId] = useState<string | undefined>(undefined);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  const isAuthenticated = Boolean(firebaseUser && !needsEmailVerification && profile);

  // Persist invite path before authentication completes (covers email login, signup, verification, and Google redirect)
  useEffect(() => {
    if (isInvitePath(location.pathname)) {
      const fullPath = `${location.pathname}${location.search}`;
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, fullPath);
      } catch {
        // Ignore storage restrictions
      }
    }
  }, [location.pathname, location.search]);

  // Restore saved invite destination once user is signed in, verified, and profile is ready
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const saved = sessionStorage.getItem(PENDING_INVITE_KEY);
      if (saved && isInvitePath(saved)) {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        const current = `${location.pathname}${location.search}`;
        if (current !== saved) {
          setPendingRedirect(saved);
        }
      }
    } catch {
      // Ignore storage restrictions
    }
  }, [isAuthenticated, location.pathname, location.search]);

  useEffect(() => {
    if (pendingRedirect && `${location.pathname}${location.search}` === pendingRedirect) {
      setPendingRedirect(null);
    }
  }, [pendingRedirect, location.pathname, location.search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading your ledger...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
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
      <Routes>
        <Route element={<AppShell onQuickAddExpense={() => openQuickExpense()} />}>
          <Route path="/" element={<DashboardPage onAddExpense={openQuickExpense} />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/join/group/:token" element={<InviteJoinPage kind="group" />} />
          <Route path="/join/friend/:token" element={<InviteJoinPage kind="friend" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

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
                <AuthenticatedRouter />
              </BrowserRouter>
            </CurrencyProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
