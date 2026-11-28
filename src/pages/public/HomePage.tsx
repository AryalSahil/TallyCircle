import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Camera,
  ChevronDown,
  Plane,
  QrCode,
  Repeat,
  Scale,
  ShieldCheck,
  Smartphone,
  Split,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PUBLIC_HERO_IMAGE } from '../../utils/helpers';
import { Button } from '../../components/ui/Primitives';

const FEATURE_HIGHLIGHTS = [
  {
    icon: Split,
    title: 'Multi-payer & flexible splits',
    description:
      'Log bills paid by one or multiple friends and divide costs equally, by exact rupee amounts, percentages, or weighted shares.',
  },
  {
    icon: Scale,
    title: 'Automatic debt simplification',
    description:
      'Integer-paise reconciliation collapses tangled group IOUs into the fewest possible direct transfers without rounding drift.',
  },
  {
    icon: QrCode,
    title: 'UPI QR & confirmed settlements',
    description:
      'Pay friends using your own UPI app via generated QR codes, then mark settlements as paid with two-party confirmation.',
  },
  {
    icon: Plane,
    title: 'Trip Mode & multi-currency',
    description:
      'Track destination outings with custom budgets, 80% / 100% spend thresholds, and multi-currency conversion to canonical INR.',
  },
  {
    icon: Repeat,
    title: 'Recurring household bills',
    description:
      'Automate monthly flat rent, Wi-Fi, or subscriptions on daily, weekly, monthly, or custom intervals with idempotent generation.',
  },
  {
    icon: BarChart3,
    title: 'Analytics, receipts & PWA',
    description:
      'Attach receipt photos up to 5 MB, inspect monthly & category charts, export CSV/Excel/PDF reports, and install offline.',
  },
];

const PREVIEW_TABS = [
  { id: 'group', label: 'Group Ledger' },
  { id: 'trip', label: 'Trip Budget' },
  { id: 'settle', label: 'UPI Settle-Up' },
] as const;

const HOME_FAQS = [
  {
    q: 'Is TallyCircle free for friend groups?',
    a: 'Yes. TallyCircle is a private friends expense tracker — not a commercial SaaS product. There are no subscription tiers, per-group limits, or paywalls.',
  },
  {
    q: 'Does every group member have the same permissions?',
    a: 'Yes. Every member in a group or trip has equal permissions to add expenses, attach receipts, record settlements, and invite friends without admin lockouts.',
  },
  {
    q: 'How do you avoid penny or paise rounding errors?',
    a: 'Every expense, share, and settlement is stored and calculated in integer paise using deterministic Hamilton remainder distribution so group balances always sum to zero.',
  },
  {
    q: 'Can I install TallyCircle on my phone?',
    a: 'Yes. TallyCircle is a Progressive Web App (PWA) you can add to your home screen from Chrome, Edge, or iOS Safari with offline read support and sync recovery.',
  },
];

export function HomePage() {
  const { firebaseUser, profile, needsEmailVerification } = useAuth();
  const isSignedIn = Boolean(firebaseUser && !needsEmailVerification && profile);
  const [previewTab, setPreviewTab] = useState<(typeof PREVIEW_TABS)[number]['id']>('group');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div>
      {/* Hero Section */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <p className="text-xs font-medium tracking-wide uppercase text-emerald-700 dark:text-emerald-400">
              Private Shared Ledger · Integer-Paise Precision
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-950 dark:text-white leading-[1.08]">
              Split trips, flat bills, and dinners without awkward math.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              TallyCircle helps real friend groups log multi-payer expenses, simplify who owes whom into the fewest transfers, attach receipts, and settle up with built-in UPI QR codes.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              {isSignedIn ? (
                <Link to="/app">
                  <Button size="lg" className="w-full sm:w-auto min-h-[46px] px-6">
                    Open Your Ledger
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/register">
                    <Button size="lg" className="w-full sm:w-auto min-h-[46px] px-6">
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[46px] px-6">
                      Log in
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Google &amp; verified email sign-in</span>
              <span aria-hidden="true">·</span>
              <span>Equal member permissions</span>
              <span aria-hidden="true">·</span>
              <span>Installable mobile &amp; desktop PWA</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                {!heroImgFailed ? (
                  <img
                    src={PUBLIC_HERO_IMAGE}
                    alt="Friends reviewing dinner receipts and shared trip expenses together at a sunlit table"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 px-6 text-center">
                    Shared group ledger for trips, flatmates, and everyday outings
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-3 text-center sm:text-left">
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Split Modes</p>
                  <p className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    4 methods
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Balance Check</p>
                  <p className="font-mono-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ₹0.00 drift
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Currencies</p>
                  <p className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    7 supported
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Core Capabilities
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Everything a friend group needs to keep ledgers clean
              </h2>
            </div>
            <Link
              to="/features"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              Explore all 10 features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fbfbfa] dark:bg-slate-900 p-6 space-y-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Genuine Interactive Product Preview */}
      <section className="border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            <div className="lg:col-span-5 space-y-5">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Inside The App
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Built around real ledger workflows, not clutter
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Switch between everyday group ledgers, multi-currency Trip Mode budgets, and instant UPI QR settlement tracking. Every number reconciles cleanly across devices in real time.
              </p>
              <div className="flex flex-wrap gap-2 pt-1" role="tablist" aria-label="Product workflow previews">
                {PREVIEW_TABS.map((tab) => {
                  const active = previewTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setPreviewTab(tab.id)}
                      className={`px-3.5 min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950'
                          : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="pt-2">
                <Link
                  to="/how-it-works"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  See the step-by-step walkthrough
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {previewTab === 'group'
                      ? 'Example · Flatmates & Weekend Outings'
                      : previewTab === 'trip'
                        ? 'Example · Trip Mode Budget Tracker'
                        : 'Example · Simplified Settlement Queue'}
                  </span>
                  <span className="font-mono-nums">Sample Preview</span>
                </div>

                {previewTab === 'group' && (
                  <div className="p-5 sm:p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Group Total</p>
                        <p className="font-mono-nums text-lg font-bold text-slate-900 dark:text-white mt-1">
                          ₹12,480.00
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Your Net Position</p>
                        <p className="font-mono-nums text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          +₹2,140.00
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Transfers Needed</p>
                        <p className="font-mono-nums text-lg font-bold text-slate-900 dark:text-white mt-1">
                          2 direct
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                      <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            Beachfront Dinner · Multi-payer
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            Paid by Rohan (₹3,200) &amp; Meera (₹1,400) · Split equally across 4
                          </p>
                        </div>
                        <span className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white shrink-0">
                          ₹4,600.00
                        </span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            Fiber Broadband · Monthly Recurring
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            Auto-logged on 1st of month · Receipt attached
                          </p>
                        </div>
                        <span className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white shrink-0">
                          ₹1,180.00
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === 'trip' && (
                  <div className="p-5 sm:p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                          Bangkok &amp; Krabi Trip
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          4 friends · THB converted to INR at locked expense rates
                        </p>
                      </div>
                      <span className="font-mono-nums text-xs font-semibold text-amber-700 dark:text-amber-400">
                        82% of budget used
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full w-[82%] bg-amber-500 rounded-full" />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
                        <span>Spent: ₹98,400</span>
                        <span>Budget cap: ₹1,20,000</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                        <p className="text-slate-500 dark:text-slate-400">Top Category</p>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          Stay &amp; Hotels · ₹48,200
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                        <p className="text-slate-500 dark:text-slate-400">Report Export</p>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          CSV · Excel · PDF ready
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === 'settle' && (
                  <div className="p-5 sm:p-6 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Instead of 6 back-and-forth payments, debt simplification suggests the minimum transfers. Settlements only reduce balances once the receiver confirms.
                    </p>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            Kabir → Rohan
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            UPI ID ready · QR code available
                          </p>
                        </div>
                        <span className="font-mono-nums text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          ₹1,420.00
                        </span>
                      </div>
                      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            Ananya → Meera
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Marked paid via UPI · Awaiting Meera&apos;s confirmation
                          </p>
                        </div>
                        <span className="font-mono-nums text-sm font-bold text-slate-900 dark:text-white">
                          ₹720.00
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works + Benefits */}
      <section className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="font-mono-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                01 / INVITE FRIENDS
              </p>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Connect via @handle or invite link
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Search verified friends by their unique @handle or share secure single- or multi-use group and trip links with expiration controls.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-mono-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                02 / LOG &amp; SPLIT BILLS
              </p>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Record real payers and receipts
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Add single or multiple payers, pick equal, exact, percentage, or share splits, tag categories, and upload receipt photos straight from mobile.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-mono-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                03 / SETTLE CLEANLY
              </p>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Pay with UPI QR and confirm
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Review simplified group transfers, open your UPI app with prefilled amounts, and keep every settlement audited until confirmed.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Equal Group Ownership
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Every group member has equal permissions — no gated admin tiers or hidden edit locks.
              </p>
            </div>
            <div className="space-y-2">
              <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Proof Attached to Bills
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Keep hotel folios, cab bills, and dinner receipts linked directly to the expense record.
              </p>
            </div>
            <div className="space-y-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Verified Private Access
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Strict Firestore rules ensure only verified group or trip members can view or edit shared expenses.
              </p>
            </div>
            <div className="space-y-2">
              <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Installable Anywhere
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Works smoothly across desktop browsers, mobile web, and installed iOS/Android home-screen PWAs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Compact FAQ Preview */}
      <section className="border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
            <div className="lg:col-span-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Common Questions
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Answers before you start a group
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Need details on invite links, multi-currency conversion, or deleting your account?
              </p>
              <Link
                to="/faq"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline pt-1"
              >
                Read full FAQ
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="lg:col-span-8 divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
              {HOME_FAQS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-900 dark:bg-slate-900 text-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Keep every shared bill fair from day one.
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Create your TallyCircle ledger in seconds with Google or email verification and invite your friends.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link to={isSignedIn ? '/app' : '/register'}>
              <Button size="lg" className="w-full sm:w-auto min-h-[46px] px-6">
                {isSignedIn ? 'Open App' : 'Get Started Free'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto min-h-[46px] px-6 border-slate-700 bg-transparent text-white hover:bg-slate-800 hover:text-white"
              >
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
