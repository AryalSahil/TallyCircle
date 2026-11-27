import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { subscribePWAUpdates, triggerPWAUpdate } from '../lib/pwa';
import { Button } from './ui/Primitives';

export function PWAUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    return subscribePWAUpdates(() => {
      setUpdateAvailable(true);
    });
  }, []);

  if (!updateAvailable) return null;

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await triggerPWAUpdate();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-[1200px] w-full mx-auto px-3.5 sm:px-6 pt-3"
    >
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
        <span className="font-medium">
          A newer version of Friends Expense Tracker is ready.
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" loading={updating} onClick={handleUpdate}>
            <RefreshCw className="w-3.5 h-3.5" />
            Update Now
          </Button>
          <button
            type="button"
            onClick={() => setUpdateAvailable(false)}
            aria-label="Dismiss update notification"
            className="min-w-[32px] min-h-[32px] rounded-md flex items-center justify-center text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
