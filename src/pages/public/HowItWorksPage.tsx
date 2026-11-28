import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Layers,
  QrCode,
  ReceiptIndianRupee,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Primitives';

const STEPS = [
  {
    number: '01',
    icon: UserCheck,
    title: 'Create your account and claim your @handle',
    description:
      'Sign in with Google or create an account with a verified email address. Choose a unique @handle and optionally add your UPI ID so friends can pay you directly later.',
    detail: 'Email verification is enforced before any shared data is read or created.',
  },
  {
    number: '02',
    icon: Users,
    title: 'Connect with friends privately',
    description:
      'Search friends by their exact @handle to send a friend request, or send them a friend invite link. Once accepted, you can quickly add each other into any group or trip.',
    detail: 'Requests require mutual consent — strangers cannot add you uninvited.',
  },
  {
    number: '03',
    icon: Layers,
    title: 'Start a Group or Trip',
    description:
      'Create a Group for recurring flatmate bills or regular outings, or enable Trip Mode with destination dates, base currency, and an optional spending budget.',
    detail: 'Invite others via direct member picker, copyable token links, WhatsApp share, or email.',
  },
  {
    number: '04',
    icon: ReceiptIndianRupee,
    title: 'Log bills with real payers, splits & receipts',
    description:
      'Record one or more payers on a single expense, split by equal, exact amounts, percentages, or shares, attach a receipt photo, or mark recurring monthly rent automatically.',
    detail: 'All splits are computed in integer paise so totals always reconcile to the exact rupee.',
  },
  {
    number: '05',
    icon: QrCode,
    title: 'Simplify debts and settle via UPI or cash',
    description:
      'TallyCircle simplifies circular IOUs into the shortest transfer list. Pay using generated UPI QR codes or record cash payments, then confirm when the money arrives.',
    detail: 'Pending settlements stay separate until the recipient confirms receipt.',
  },
  {
    number: '06',
    icon: BarChart3,
    title: 'Inspect analytics & export reports anytime',
    description:
      'Review monthly trends, category charts, and friend breakdowns on the Analytics page, or download CSV, Excel, and PDF reports for group transparency.',
    detail: 'Install TallyCircle as a PWA to check balances and log offline-queued updates anywhere.',
  },
];

export function HowItWorksPage() {
  const { firebaseUser, profile, needsEmailVerification } = useAuth();
  const isSignedIn = Boolean(firebaseUser && !needsEmailVerification && profile);

  return (
    <div>
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Workflow
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
            From splitting dinner to settling up in six clean steps.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            No spreadsheet formulas or manual cross-offs. Here is how TallyCircle keeps shared finances accurate from the first bill to the final UPI transfer.
          </p>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="space-y-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-5 items-start"
              >
                <div className="md:col-span-3 flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-mono-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      STEP {step.number}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">TallyCircle Flow</p>
                  </div>
                </div>

                <div className="md:col-span-9 space-y-2.5">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {step.title}
                  </h2>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                    {step.description}
                  </p>
                  <p className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{step.detail}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Have questions about edge cases or privacy?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Browse the FAQ or create an account to test a group ledger with friends.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link to="/faq">
              <Button variant="outline" className="w-full sm:w-auto min-h-[44px]">
                Read FAQ
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
