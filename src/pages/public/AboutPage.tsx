import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, Lock, Scale, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ABOUT_PLANNING_IMAGE } from '../../utils/helpers';
import { Button } from '../../components/ui/Primitives';

const PRINCIPLES = [
  {
    icon: Users,
    title: 'Built for friends, not SaaS funnels',
    description:
      'TallyCircle is a private expense-sharing tool for real friend groups, roommates, and travel crews. You will never run into subscription gates, paywalled charts, or group limits.',
  },
  {
    icon: Scale,
    title: 'Equal permissions for every member',
    description:
      'Every member inside a group or trip has equal ability to add expenses, upload receipts, update details, and settle balances — because shared outings work on mutual trust.',
  },
  {
    icon: Calculator,
    title: 'Integer-paise arithmetic',
    description:
      'Floating-point numbers cause mysterious 1-paisa discrepancies. We store and split every amount in exact integer paise so your group ledger always balances to zero.',
  },
  {
    icon: Lock,
    title: 'Scoped privacy & verified identity',
    description:
      'Groups, trips, receipts, and settlements are guarded by Firebase Security Rules and email verification. Only confirmed members of a group or trip can access its records.',
  },
];

export function AboutPage() {
  const { firebaseUser, profile, needsEmailVerification } = useAuth();
  const isSignedIn = Boolean(firebaseUser && !needsEmailVerification && profile);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div>
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-12 sm:pt-16 sm:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              About TallyCircle
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
              Shared memories shouldn&apos;t end with messy spreadsheets.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Every weekend trip, flatshare, or group dinner eventually turns into someone hunting down screenshots, chasing half-remembered cab rides, and trying to figure out who owes whom across four chats.
            </p>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              TallyCircle (Friends Expense Tracker) was created to keep all of those shared numbers in one calm, accurate ledger — real-time across phones and laptops, backed by exact integer-paise math and practical UPI QR settlement tools.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <Link to={isSignedIn ? '/app' : '/register'}>
                <Button size="lg" className="min-h-[44px]">
                  {isSignedIn ? 'Open App' : 'Start Your First Group'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" size="lg" className="min-h-[44px]">
                  Get in Touch
                </Button>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                {!imgFailed ? (
                  <img
                    src={ABOUT_PLANNING_IMAGE}
                    alt="Minimalist desk setup showing trip journal, passport, coffee cup, and expense notebook"
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 px-6 text-center">
                    Calm shared planning for trips, flatmates, and friend circles
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Engineering &amp; Product Principles
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              How we keep the ledger trustworthy
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {PRINCIPLES.map((item) => {
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
    </div>
  );
}
