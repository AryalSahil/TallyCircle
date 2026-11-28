import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Camera,
  Layers,
  Plane,
  QrCode,
  Repeat,
  Scale,
  Smartphone,
  Split,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Primitives';

const DETAILED_FEATURES = [
  {
    icon: Users,
    category: 'Connections',
    title: 'Friend Management & @Handle Lookup',
    summary:
      'Add real friends by searching their unique @handle or sharing a secure friend invite link. Accept or decline requests cleanly, set personal private nicknames for friends, and keep connections scoped strictly to people you know.',
    highlights: [
      'Instant @handle search without exposing full user directories',
      'Private per-user friend notes and custom nicknames',
      'Shareable friend invite links with token revocation',
    ],
  },
  {
    icon: Layers,
    category: 'Splitting',
    title: 'Group Expense Splitting (4 Split Methods)',
    summary:
      'Divide shared dinners, flat rent, or group purchases the exact way your group agreed. Every amount is calculated in integer paise using deterministic largest-remainder rounding so splits never lose or invent a rupee.',
    highlights: [
      'Equal splits across selected participants',
      'Exact unequal rupee/paise amounts per person',
      'Percentage splits and weighted share units (e.g., 2x / 1x)',
    ],
  },
  {
    icon: Split,
    category: 'Payments',
    title: 'Multiple Payers on One Bill',
    summary:
      'Two friends split the counter bill while four people shared the meal? Record multiple payers and their exact contributions on a single expense record so balances reflect reality immediately.',
    highlights: [
      'Support any combination of group members paying upfront',
      'Validate total paid equals total bill before saving',
      'Preserve clear breakdown in expense detail view and exports',
    ],
  },
  {
    icon: Scale,
    category: 'Reconciliation',
    title: 'Debt Simplification & Zero-Sum Ledger',
    summary:
      'TallyCircle computes each member’s net balance across all expenses and confirmed settlements, then simplifies messy circular debts into the fewest possible direct transfers.',
    highlights: [
      'Automatic zero-sum verification across every group and trip',
      'Minimum-transfer debt graph simplification',
      'Real-time balance updates synced to all members',
    ],
  },
  {
    icon: QrCode,
    category: 'Settlements',
    title: 'Settlement Tracking & Built-In UPI QR Codes',
    summary:
      'Record cash or UPI repayments and generate standard UPI payment QR codes and deep links for friends who add their UPI ID. Receivers confirm settlements so balances never change silently.',
    highlights: [
      'Auto-generated UPI QR codes with prefilled amount & note',
      'Two-step confirmation flow (Pending -> Confirmed)',
      'Settlement reminders via in-app notifications',
    ],
  },
  {
    icon: BarChart3,
    category: 'Insights',
    title: 'Expense Analytics & Exportable Reports',
    summary:
      'See where shared money goes across groups and trips with monthly spending line charts, category pie breakdowns, friend contribution comparisons, and downloadable spreadsheets or PDF summaries.',
    highlights: [
      'Overview KPIs: total spent, paid, owed, and to receive',
      'Monthly, yearly, category, and friend-by-friend charts',
      'Export clean CSV, Excel (.xlsx), and PDF ledger reports',
    ],
  },
  {
    icon: Camera,
    category: 'Attachments',
    title: 'Receipt Photo Attachments',
    summary:
      'Snap or upload JPEG, PNG, or WebP receipt images (up to 5 MB) directly onto any group or trip expense. Receipts are stored privately in Firebase Storage and accessible only to group or trip members.',
    highlights: [
      'Works from desktop file picker or mobile camera roll',
      'Protected by group/trip membership Storage rules',
      'Replace or delete attachments cleanly from expense details',
    ],
  },
  {
    icon: Repeat,
    category: 'Automation',
    title: 'Recurring Expenses',
    summary:
      'Set up shared rent, utilities, streaming plans, or gym memberships once. Choose daily, weekly, monthly, yearly, or custom day intervals with pause, resume, edit, and catch-up support.',
    highlights: [
      'Month-end date clamping (e.g., 31st -> Feb 28/29)',
      'Idempotent occurrence keys prevent duplicate entries',
      'Scheduled backend & app-open catch-up synchronization',
    ],
  },
  {
    icon: Plane,
    category: 'Travel',
    title: 'Trip Mode, Multi-Currency & Budgets',
    summary:
      'Keep travel expenses organized separately with destination, start/end dates, trip budget caps (with 80% warning and 100% exceeded alerts), and multi-currency conversion into canonical INR.',
    highlights: [
      'Log expenses in INR, USD, EUR, GBP, AED, SGD, or THB',
      'Dedicated trip invite links and participant summaries',
      'Live trip budget progress and category totals',
    ],
  },
  {
    icon: Smartphone,
    category: 'Access',
    title: 'Real-Time Sync & Installable PWA',
    summary:
      'Every update propagates live via Firestore listeners across desktop and mobile. Install TallyCircle as a standalone Progressive Web App with offline cached viewing and automatic sync when reconnected.',
    highlights: [
      'Android Chrome, iOS Safari, and Desktop Edge/Chrome installable',
      'Offline banner and automatic queued write recovery',
      'Light and dark themes synced to your preference',
    ],
  },
];

export function FeaturesPage() {
  const { firebaseUser, profile, needsEmailVerification } = useAuth();
  const isSignedIn = Boolean(firebaseUser && !needsEmailVerification && profile);

  return (
    <div>
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Product Capabilities
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
            Designed for every shared bill a friend group runs into.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            From splitting cab rides with multiple payers to tracking multi-currency vacation budgets and recurring flat bills, every feature below is built directly into TallyCircle with no locked tiers.
          </p>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DETAILED_FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-mono-nums text-xs text-slate-400 dark:text-slate-500">
                      {String(index + 1).padStart(2, '0')} · {feature.category}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      {feature.title}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {feature.summary}
                    </p>
                  </div>
                </div>

                <ul className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  {feature.highlights.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold" aria-hidden="true">
                        —
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Ready to try TallyCircle with your friends?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              See the 6-step setup workflow or jump straight into creating your first group or trip.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link to="/how-it-works">
              <Button variant="outline" className="w-full sm:w-auto min-h-[44px]">
                How It Works
              </Button>
            </Link>
            <Link to={isSignedIn ? '/app' : '/register'}>
              <Button className="w-full sm:w-auto min-h-[44px]">
                {isSignedIn ? 'Open App' : 'Get Started'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
