import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Mail, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { submitContactMessage } from '../../services/contactService';
import { Button, InputField } from '../../components/ui/Primitives';

export function ContactPage() {
  const { profile, firebaseUser } = useAuth();
  const { showToast } = useToast();
  const mountedAtRef = useRef<number>(Date.now());

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  useEffect(() => {
    if (!name && profile?.fullName) {
      setName(profile.fullName);
    }
    if (!email && (profile?.email || firebaseUser?.email)) {
      setEmail(profile?.email || firebaseUser?.email || '');
    }
  }, [profile?.fullName, profile?.email, firebaseUser?.email, name, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const elapsedMs = Date.now() - mountedAtRef.current;
      const res = await submitContactMessage({
        name,
        email,
        subject,
        message,
        honeypot,
        elapsedMs,
      });
      setReferenceId(res.referenceId);
      setSubject('');
      setMessage('');
      mountedAtRef.current = Date.now();
      showToast('Message sent', {
        description: `Reference ${res.referenceId}`,
        variant: 'success',
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not send your message right now. Please try again.';
      setErrorMessage(msg);
      showToast('Could not send message', { description: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Guidance Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Contact &amp; Support
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
                Send feedback, bug reports, or privacy requests.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Messages submitted here are validated by our backend and recorded securely in Firestore so nothing gets lost.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    What to include for faster help
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Mention your browser or device (Android PWA, iOS Safari, or Desktop), the group or trip action you tried, and any visible error wording.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Privacy &amp; Account Deletion
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Need to remove your account or export records first? Review our{' '}
                    <Link
                      to="/privacy#account-deletion"
                      className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                    >
                      account deletion guide
                    </Link>{' '}
                    or check the{' '}
                    <Link
                      to="/faq"
                      className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                    >
                      FAQ
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Real Contact Form */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
              {referenceId ? (
                <div className="space-y-5 py-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      Your message has been received
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Thank you for writing in. Save the reference code below if you need to follow up on this request.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Reference ID
                    </p>
                    <p className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white mt-0.5 break-all">
                      {referenceId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setReferenceId(null);
                        setErrorMessage(null);
                      }}
                    >
                      Send another message
                    </Button>
                    <Link to="/">
                      <Button variant="ghost">Back to Home</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-1">
                    <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      Send a message
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      All fields are required. Rate-limited to prevent automated spam.
                    </p>
                  </div>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-3.5 flex items-start gap-2.5 text-xs text-red-800 dark:text-red-200"
                    >
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{errorMessage}</p>
                    </div>
                  )}

                  {/* Honeypot field for bot filtering */}
                  <div className="sr-only" aria-hidden="true">
                    <label htmlFor="contact-website">Leave this field empty</label>
                    <input
                      id="contact-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField
                      label="Your name"
                      type="text"
                      placeholder="Rohan Mehta"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      minLength={2}
                      maxLength={80}
                      required
                    />
                    <InputField
                      label="Email address"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={120}
                      required
                    />
                  </div>

                  <InputField
                    label="Subject"
                    type="text"
                    placeholder="Question about group invite links or account data"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    minLength={3}
                    maxLength={120}
                    required
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="contact-message"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Message
                      </label>
                      <span className="font-mono-nums text-[11px] text-slate-400">
                        {message.trim().length}/2000
                      </span>
                    </div>
                    <textarea
                      id="contact-message"
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      minLength={10}
                      maxLength={2000}
                      placeholder="Describe your question, feedback, or issue..."
                      required
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors resize-y"
                    />
                  </div>

                  <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Protected by request validation and 60-second anti-spam cooldown.
                    </p>
                    <Button
                      type="submit"
                      size="lg"
                      loading={submitting}
                      className="w-full sm:w-auto min-h-[44px]"
                    >
                      <Send className="w-4 h-4" />
                      Send Message
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
