import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '../../components/ui/Primitives';

type FaqCategory =
  | 'All'
  | 'Getting Started'
  | 'Splitting & Math'
  | 'Invites & Privacy'
  | 'Trips & Receipts'
  | 'PWA & Account';

interface FaqItem {
  category: Exclude<FaqCategory, 'All'>;
  question: string;
  answer: string;
}

const FAQ_CATEGORIES: FaqCategory[] = [
  'All',
  'Getting Started',
  'Splitting & Math',
  'Invites & Privacy',
  'Trips & Receipts',
  'PWA & Account',
];

const FAQ_ITEMS: FaqItem[] = [
  {
    category: 'Getting Started',
    question: 'How do I create an account and sign in?',
    answer:
      'You can sign in directly with Google Sign-In or register using your email and password. Email accounts require clicking the verification link sent to your inbox before accessing groups, friends, or ledgers.',
  },
  {
    category: 'Getting Started',
    question: 'Is TallyCircle free or is there a paid plan?',
    answer:
      'TallyCircle is a private friends expense tracker — not a commercial SaaS platform. There are no subscription tiers, monthly fees, or per-group caps.',
  },
  {
    category: 'Invites & Privacy',
    question: 'How do friend requests and @handles work?',
    answer:
      'Every user chooses a unique @handle in their profile. Friends can search your exact @handle to send a request, or you can share a private friend invite link. Full user directories are never browsable publicly.',
  },
  {
    category: 'Invites & Privacy',
    question: 'How do group and trip invitation links stay secure?',
    answer:
      'Group and trip invite links use cryptographically random 192-bit tokens instead of predictable IDs. Creators can set expiration dates and usage limits, or revoke any link immediately from the group or trip settings.',
  },
  {
    category: 'Invites & Privacy',
    question: 'Do group creators have special admin power over expenses?',
    answer:
      'No. Every verified member of a group or trip shares equal permissions to add expenses, upload receipts, record settlements, and manage schedules.',
  },
  {
    category: 'Splitting & Math',
    question: 'What expense split methods are supported?',
    answer:
      'You can split any bill equally, by exact rupee/paise amounts (unequal), by percentages totaling 100%, or by weighted share units (for example 2 shares vs 1 share). You can also assign multiple payers on the same bill.',
  },
  {
    category: 'Splitting & Math',
    question: 'How does TallyCircle prevent rounding errors?',
    answer:
      'All financial values are stored and calculated in integer paise rather than floating-point decimals. Remainder paise are distributed deterministically using Hamilton largest-remainder rounding so group totals always reconcile to zero.',
  },
  {
    category: 'Splitting & Math',
    question: 'How do debt simplification and UPI settlements work?',
    answer:
      'TallyCircle aggregates net balances across all expenses and confirmed settlements to suggest the minimum number of transfers. If the recipient added a UPI ID in their profile, you can scan a generated UPI QR code or tap Pay via UPI, then confirm settlement once received.',
  },
  {
    category: 'Trips & Receipts',
    question: 'What is Trip Mode and how do multi-currency expenses work?',
    answer:
      'Trip Mode organizes destination outings with start/end dates, participant lists, and optional spending budgets (alerting at 80% and 100%). Expenses logged in USD, EUR, GBP, AED, SGD, or THB convert into canonical INR at the expense exchange rate so balances remain consistent.',
  },
  {
    category: 'Trips & Receipts',
    question: 'What receipt file formats and sizes are supported?',
    answer:
      'You can attach JPEG, PNG, or WebP receipt photos up to 5 MB per expense. Receipt files are stored in Firebase Storage and restricted by security rules so only members of that group or trip can view them.',
  },
  {
    category: 'Trips & Receipts',
    question: 'How do recurring expenses avoid creating duplicates?',
    answer:
      'Recurring rules (daily, weekly, monthly, yearly, or custom intervals) generate each occurrence using a deterministic idempotency key derived from the rule ID and due date, ensuring duplicate bills are never inserted even across concurrent syncs.',
  },
  {
    category: 'PWA & Account',
    question: 'Can I install TallyCircle on Android, iOS, or desktop?',
    answer:
      'Yes. Open TallyCircle in Chrome or Edge to use the native install prompt (or the Install App option in Profile & Settings), or use Share → Add to Home Screen in iOS Safari. Cached ledger views remain accessible offline and sync queued edits once reconnected.',
  },
  {
    category: 'PWA & Account',
    question: 'How can I export my data or request account deletion?',
    answer:
      'You can export full group or analytics reports in CSV, Excel (.xlsx), or PDF anytime inside the Analytics page. For leaving groups, removing profile data, or requesting full account deletion, see the Account Deletion section on our Privacy Policy page or message us via Contact.',
  },
];

export function FaqPage() {
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('All');
  const [openQuestion, setOpenQuestion] = useState<string | null>(FAQ_ITEMS[0].question);

  const visibleFaqs = useMemo(() => {
    if (selectedCategory === 'All') return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div>
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-10">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Frequently Asked Questions
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
            Clear answers about splitting, invites, trips, and privacy.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Filter by topic below or reach out directly if you run into a question not covered here.
          </p>
        </div>

        <div
          className="mt-8 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Filter FAQ by category"
        >
          {FAQ_CATEGORIES.map((category) => {
            const active = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(category)}
                className={`px-3.5 min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {visibleFaqs.map((item) => {
            const isOpen = openQuestion === item.question;
            return (
              <div key={item.question} className="px-5 sm:px-7">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenQuestion(isOpen ? null : item.question)}
                  className="w-full py-5 text-left flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-1 pr-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      {item.category}
                    </p>
                    <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                      {item.question}
                    </h2>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="pb-5 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                    {item.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Still have a question or feedback?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Send us a message through the contact form and include your reference ID for follow-ups.
            </p>
          </div>
          <Link to="/contact" className="shrink-0">
            <Button className="w-full sm:w-auto min-h-[44px]">
              Contact Support
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
