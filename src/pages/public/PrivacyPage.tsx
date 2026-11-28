import React from 'react';
import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-24 space-y-10">
      <header className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Privacy Policy
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
          How TallyCircle handles your shared expense data
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Applies to TallyCircle (Friends Expense Tracker) · [Owner Review Required: Add effective date &amp; operator contact email before public distribution]
        </p>
      </header>

      <div className="space-y-8 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            1. Information stored when you use TallyCircle
          </h2>
          <p>
            TallyCircle is a private expense-sharing tool for friends. To provide real-time balance tracking and authentication, the application stores only the records required to run your ledger in Firebase Authentication, Cloud Firestore, and Firebase Storage:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li>
              <strong className="text-slate-900 dark:text-white">Account &amp; Profile Data:</strong> Your display name, email address, unique @handle, optional phone number, optional UPI ID (for generating peer payment QR codes), preferred currency, theme setting, and optional profile photo.
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Friends &amp; Invitations:</strong> Friend requests, confirmed friendships, private friend nicknames, and invite tokens created for groups, trips, or friend connections.
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Ledgers &amp; Receipts:</strong> Groups, trips, expenses, payer/split shares, recurring schedules, settlements, activity logs, notifications, and optional receipt images uploaded to Firebase Storage.
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Contact Form Submissions:</strong> Messages submitted on the <Link to="/contact" className="text-emerald-700 dark:text-emerald-400 hover:underline">/contact</Link> page (name, email, subject, message, and optional signed-in user ID) so support inquiries can be reviewed.
            </li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            2. Who can see your data
          </h2>
          <p>
            Access is enforced on the server by Firestore and Storage security rules. Private profile details (email, phone, settings) are readable only by your authenticated account. Shared groups, trips, expenses, settlements, and receipt attachments are readable only by verified members or participants of that specific group or trip.
          </p>
          <p>
            TallyCircle does not sell user data, serve third-party advertising trackers, or publish user directories for public browsing.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            3. Local browser cache &amp; offline PWA storage
          </h2>
          <p>
            When installed as a Progressive Web App or used offline, your browser stores static app assets and cached Firestore data locally so you can view recent balances without a connection and automatically sync queued updates when back online. Local browser storage is also used for your theme preference and contact-form anti-spam cooldown timestamp.
          </p>
        </section>

        <section id="account-deletion" className="space-y-2.5 scroll-mt-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            4. Exporting data &amp; deleting your account
          </h2>
          <p className="text-sm">
            You can export your expense summaries in CSV, Excel, or PDF format anytime from the Analytics page inside the app, remove uploaded receipt photos on individual expenses, or leave any group or trip from its detail page.
          </p>
          <p className="text-sm">
            To request full deletion of your user profile and personal records from the project database, submit a request via our{' '}
            <Link to="/contact" className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline">
              Contact page
            </Link>{' '}
            from your registered email address with the subject &ldquo;Account Deletion Request&rdquo;. [Owner Review Required: Specify SLA/operator processing email here.]
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            5. Contact regarding privacy
          </h2>
          <p>
            Questions about this policy or data handling can be sent directly through the{' '}
            <Link to="/contact" className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline">
              Contact form
            </Link>
            . [Owner Review Required: Insert legal operator name and direct privacy contact email if required in your jurisdiction.]
          </p>
        </section>
      </div>
    </div>
  );
}
