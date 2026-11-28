import React from 'react';
import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-24 space-y-10">
      <header className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Terms of Use
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
          Terms for using TallyCircle
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Private Friends Expense Tracker · [Owner Review Required: Add effective date, operator name, and governing jurisdiction]
        </p>
      </header>

      <div className="space-y-8 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            1. Private bookkeeping tool — not a payment processor
          </h2>
          <p>
            TallyCircle is a private expense-splitting and shared ledger application for friends. TallyCircle does not hold funds, process payments, act as an escrow service, or provide banking or financial advisory services. When you tap a UPI link or scan a UPI QR code inside the app, the payment happens directly inside your chosen external UPI application between you and your friend.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            2. Account accuracy &amp; responsible use
          </h2>
          <p>
            You are responsible for keeping your login credentials secure and verifying expense amounts, currency conversion rates, and settlement confirmations within your groups and trips. Please only invite people you know and avoid uploading unrelated or unlawful content in receipt attachments or messages.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            3. Equal group permissions
          </h2>
          <p>
            Every verified member inside a TallyCircle group or trip has equal permission to add, edit, or reconcile shared records. Members are responsible for coordinating shared edits and confirming settlements fairly among themselves.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            4. Service availability
          </h2>
          <p>
            TallyCircle is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis for private friend-group use. While we use integer-paise arithmetic and offline sync safeguards to protect accuracy, you should keep independent exports of critical travel or household records using the built-in CSV, Excel, or PDF export tools.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            5. Questions &amp; notices
          </h2>
          <p>
            If you have questions about these terms, please reach out via the{' '}
            <Link to="/contact" className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline">
              Contact page
            </Link>{' '}
            or review our{' '}
            <Link to="/privacy" className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline">
              Privacy Policy
            </Link>
            . [Owner Review Required: Insert governing law and operator entity details before commercial or wide public launch.]
          </p>
        </section>
      </div>
    </div>
  );
}
