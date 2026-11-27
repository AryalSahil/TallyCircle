import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  HelpCircle,
  Monitor,
  Share,
  Smartphone,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useToast } from '../contexts/ToastContext';
import { Button, Card, Modal } from './ui/Primitives';

export function PWAInstallCard() {
  const { isInstallable, isInstalled, isIOS, platform, justInstalled, install } =
    usePWAInstall();
  const { showToast } = useToast();
  const [installing, setInstalling] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  // Hide the Install button completely when already installed / running in standalone mode
  if (isInstalled) {
    if (!justInstalled) return null;
    return (
      <Card className="p-4 sm:p-5 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Friends Expense Tracker installed
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              You can now launch Friends Expense directly from your home screen or desktop app drawer.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const handleInstallClick = async () => {
    if (!isInstallable) {
      setShowInstructionsModal(true);
      return;
    }
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        showToast('Friends Expense Tracker installed', {
          description: 'Launch it anytime from your home screen or applications menu.',
          variant: 'success',
        });
      } else if (outcome === 'dismissed') {
        showToast('Installation cancelled', {
          description: 'You can install the app anytime from Profile & Settings.',
          variant: 'info',
        });
      } else {
        setShowInstructionsModal(true);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              {isIOS || platform === 'android-chromium' ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <Monitor className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Install Friends Expense Tracker
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {isInstallable
                  ? 'Install on your device for instant full-screen launch, offline access to cached ledgers, and native app feel.'
                  : isIOS
                    ? 'Add to your iPhone or iPad Home Screen for a full-screen app experience.'
                    : 'Install on your phone or computer for quick launch and offline ledger viewing.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isInstallable ? (
              <Button
                type="button"
                onClick={handleInstallClick}
                loading={installing}
                className="w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                Install App
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInstructionsModal(true)}
                className="w-full sm:w-auto"
              >
                {isIOS ? <Share className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
                How to Install
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Modal
        open={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
        title="Install Friends Expense Tracker"
        subtitle="Follow the steps for your browser to add the app to your device."
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          {isIOS ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
              <p className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wide">
                iPhone / iPad (Safari)
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
                <li>
                  Open this page in <strong>Safari</strong> (if using another iOS browser, open the link in Safari first).
                </li>
                <li>
                  Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                </li>
              </ol>
            </div>
          ) : platform === 'android-chromium' ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
              <p className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wide">
                Android (Chrome / Edge)
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
                <li>
                  Tap the browser menu button (<strong>⋮</strong>) in the top-right corner.
                </li>
                <li>
                  Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>
                  Confirm <strong>Install</strong> to place Friends Expense on your home screen.
                </li>
              </ol>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
              <p className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wide">
                Desktop (Chrome / Edge)
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
                <li>
                  Look for the <strong>Install</strong> icon on the right side of the browser address bar.
                </li>
                <li>
                  Or open the browser menu (<strong>⋮</strong> in Chrome or <strong>⋯</strong> in Edge) →{' '}
                  <strong>Install Friends Expense Tracker</strong> (or <strong>Apps → Install this site as an app</strong>).
                </li>
              </ol>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInstructionsModal(false)}
              className="w-full sm:w-auto"
            >
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
