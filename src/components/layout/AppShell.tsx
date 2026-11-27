import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Layers,
  BarChart3,
  Bell,
  Sun,
  Moon,
  Plus,
  LogOut,
  ReceiptIndianRupee,
  Search,
  Menu,
  X,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useAppData } from '../../contexts/AppDataContext';
import { CURRENCY_CODES, CurrencyCode, SUPPORTED_CURRENCIES } from '../../types';
import { Avatar, Button } from '../ui/Primitives';
import { GlobalSearchModal } from '../GlobalSearchModal';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/groups', label: 'Groups', icon: Layers },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/notifications', label: 'Alerts', icon: Bell },
];

export function AppShell({ onQuickAddExpense }: { onQuickAddExpense: () => void }) {
  const { profile, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { baseCurrency, setBaseCurrency } = useCurrency();
  const { unreadNotificationsCount, activeGroups } = useAppData();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const pageTitle = (() => {
    if (location.pathname === '/') return 'Overview';
    if (location.pathname.startsWith('/groups/')) return 'Group Ledger';
    if (location.pathname.startsWith('/groups')) return 'Groups';
    if (location.pathname.startsWith('/friends')) return 'Friends';
    if (location.pathname.startsWith('/analytics')) return 'Analytics';
    if (location.pathname.startsWith('/notifications')) return 'Notifications';
    if (location.pathname.startsWith('/profile')) return 'Profile & Settings';
    return 'TallyCircle';
  })();

  const renderNavLinks = (isMobileDrawer = false) => (
    <>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const badge = item.to === '/notifications' ? unreadNotificationsCount : 0;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => isMobileDrawer && setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center justify-between gap-3 px-3 min-h-[44px] py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`
            }
          >
            <span className="flex items-center gap-3">
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </span>
            {badge > 0 && (
              <span className="font-mono-nums text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {badge}
              </span>
            )}
          </NavLink>
        );
      })}

      <div className="pt-5 pb-2 px-3">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
          Active groups
        </p>
      </div>
      {activeGroups.length === 0 ? (
        <p className="px-3 text-xs text-slate-400 dark:text-slate-500">
          No active groups yet
        </p>
      ) : (
        <div className="space-y-0.5">
          {activeGroups.slice(0, isMobileDrawer ? 12 : 6).map((g) => (
            <NavLink
              key={g.id}
              to={`/groups/${g.id}`}
              onClick={() => isMobileDrawer && setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-3 min-h-[40px] py-2 rounded-lg text-sm truncate transition-colors ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
                }`
              }
            >
              <span className="truncate">{g.name}</span>
            </NavLink>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-[100dvh] flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0">
            <ReceiptIndianRupee className="w-4 h-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
            TallyCircle
          </span>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          {renderNavLinks(false)}
        </div>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`
            }
          >
            <Avatar name={profile?.fullName || 'User'} photoUrl={profile?.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {profile?.fullName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                @{profile?.handle}
              </p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile & Tablet Slide-Out Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation drawer"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-[82vw] max-w-xs h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0">
                  <ReceiptIndianRupee className="w-4 h-4" />
                </div>
                <span className="font-display text-base font-bold tracking-tight">
                  TallyCircle
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-1">
              {renderNavLinks(true)}
            </div>

            <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Appearance</span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {resolvedTheme === 'dark' ? (
                    <>
                      <Sun className="w-3.5 h-3.5" />
                      Light mode
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5" />
                      Dark mode
                    </>
                  )}
                </button>
              </div>

              <NavLink
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 min-h-[44px] py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`
                }
              >
                <Avatar name={profile?.fullName || 'User'} photoUrl={profile?.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {profile?.fullName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Profile & settings
                  </p>
                </div>
                <UserCircle className="w-4 h-4 text-slate-400 shrink-0" />
              </NavLink>

              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 min-h-[44px] py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {pageTitle}
            </h1>
          </div>

          {/* Global Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center justify-between gap-3 flex-1 max-w-sm h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Search title, #tag, or participant...</span>
            </span>
            <kbd className="text-[10px] font-mono-nums text-slate-400 shrink-0">Ctrl K</kbd>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search expenses globally"
              className="md:hidden min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            <select
              aria-label="Preferred display currency"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)}
              className="h-10 sm:h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-1.5 sm:px-2 text-xs font-mono-nums font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer"
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} ({SUPPORTED_CURRENCIES[code].symbol})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="hidden sm:flex min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Button size="sm" onClick={onQuickAddExpense} className="px-2.5 sm:px-3">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Expense</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </header>

        <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* Viewport */}
        <main className="flex-1 max-w-[1200px] w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation (compact, <= 15% mobile height) */}
      <nav
        aria-label="Primary mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm grid grid-cols-5 items-center pb-safe px-1"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const badge = item.to === '/notifications' ? unreadNotificationsCount : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center min-h-[52px] py-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full px-0.5">{item.label}</span>
              {badge > 0 && (
                <span className="absolute top-1.5 right-2.5 font-mono-nums text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
