import React, { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
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

function AuthenticatedRouter() {
  const { firebaseUser, profile, loading, needsEmailVerification } = useAuth();
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [quickExpenseGroupId, setQuickExpenseGroupId] = useState<string | undefined>(undefined);

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

  if (!firebaseUser || needsEmailVerification || !profile) {
    return <AuthPage />;
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
      <Analytics />
    </ErrorBoundary>
  );
}
