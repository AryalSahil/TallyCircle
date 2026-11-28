import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Menu,
  Moon,
  ReceiptIndianRupee,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/Primitives';

const PUBLIC_NAV_LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

const ROUTE_TITLES: Record<string, string> = {
  '/': 'TallyCircle — Friends Expense Tracker',
  '/features': 'Features — TallyCircle',
  '/how-it-works': 'How It Works — TallyCircle',
  '/about': 'About — TallyCircle',
  '/faq': 'FAQ — TallyCircle',
  '/contact': 'Contact — TallyCircle',
  '/privacy': 'Privacy Policy — TallyCircle',
  '/terms': 'Terms of Use — TallyCircle',
};

export function PublicLayout() {
  const { firebaseUser, profile, needsEmailVerification } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSignedIn = Boolean(firebaseUser && !needsEmailVerification && profile);

  useEffect(() => {
    setMobileMenuOpen(false);
    document.title = ROUTE_TITLES[location.pathname] || 'TallyCircle — Friends Expense Tracker';

    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      const targetId = location.hash.slice(1);
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#fbfbfa] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sticky Public Header — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-40 pt-safe border-b border-slate-200/80 dark:border-slate-800/90 bg-[#fbfbfa]/95 dark:bg-slate-950/95 backdrop-blur-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Brand */}
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0">
              <ReceiptIndianRupee className="w-4 h-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap text-slate-900 dark:text-white">
              TallyCircle
            </span>
          </Link>

          {/* Zone 2: Single-line Navigation */}
          <nav
            aria-label="Public navigation"
            className="hidden md:flex items-center gap-6"
          >
            {PUBLIC_NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    isActive
                      ? 'border-emerald-600 dark:border-emerald-400 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Theme Toggle + Auth Action + Single Primary CTA */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-w-[40px] min-h-[40px] sm:min-w-[36px] sm:min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {isSignedIn ? (
              <Link to="/app" className="hidden sm:inline-flex">
                <Button size="sm">
                  Open App
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex items-center justify-center h-9 px-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors"
                >
                  Log in
                </Link>
                <Link to="/register" className="hidden sm:inline-flex">
                  <Button size="sm">
                    Get Started
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open public navigation menu"
              className="md:hidden min-w-[44px] min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile site navigation"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-[84vw] max-w-xs h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl pt-safe">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0">
                  <ReceiptIndianRupee className="w-4 h-4" />
                </div>
                <span className="font-display text-base font-bold tracking-tight">
                  TallyCircle
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="p-4 flex-1 overflow-y-auto space-y-1">
              {PUBLIC_NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
                <NavLink
                  to="/privacy"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center px-3 min-h-[44px] rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Privacy Policy
                </NavLink>
                <NavLink
                  to="/terms"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center px-3 min-h-[44px] rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Terms of Use
                </NavLink>
              </div>
            </nav>

            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
              {isSignedIn ? (
                <Link to="/app" onClick={() => setMobileMenuOpen(false)} className="block">
                  <Button className="w-full min-h-[44px]">
                    Open App
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="block">
                    <Button className="w-full min-h-[44px]">
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block">
                    <Button variant="outline" className="w-full min-h-[44px]">
                      Log in
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main Public Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Editorial Multi-Column Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-14">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-10">
            <div className="md:col-span-5 space-y-3">
              <Link to="/" className="inline-flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white dark:text-slate-950">
                  <ReceiptIndianRupee className="w-4 h-4" />
                </div>
                <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  TallyCircle
                </span>
              </Link>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm">
                A private Friends Expense Tracker for roommates, travel companions, and dinner crews. Exact integer-paise splits, simplified debts, and real-time sync across web and PWA.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Built strictly for personal shared expenses — no subscriptions, no ads, and no payment gateways.
              </p>
            </div>

            <div className="md:col-span-2 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Product
              </h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/features" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Features
                  </Link>
                </li>
                <li>
                  <Link to="/how-it-works" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/faq" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    FAQ
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Account
              </h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/login" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Create Account
                  </Link>
                </li>
                <li>
                  <Link to="/app" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Open Ledger App
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Support &amp; Legal
              </h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/contact" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Contact Support
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/privacy#account-deletion" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Data &amp; Account Deletion
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white">
                    Terms of Use
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <p>© {new Date().getFullYear()} TallyCircle — Friends Expense Tracker.</p>
            <p>Private expense-sharing tool · Real-time Firebase sync · Installable PWA</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
