import { useCallback, useEffect, useState } from 'react';
import {
  BeforeInstallPromptEvent,
  clearDeferredInstallPrompt,
  detectPWAPlatform,
  getDeferredInstallPrompt,
  isStandaloneDisplayMode,
  PWAPlatformKind,
  subscribeInstallPrompt,
} from '../lib/pwa';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    getDeferredInstallPrompt()
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isStandaloneDisplayMode());
  const [justInstalled, setJustInstalled] = useState(false);
  const [platform] = useState<PWAPlatformKind>(() => detectPWAPlatform());

  useEffect(() => {
    setIsInstalled(isStandaloneDisplayMode());

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      if (isStandaloneDisplayMode()) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mq?.addEventListener?.('change', onDisplayModeChange);

    const unsubscribe = subscribeInstallPrompt(
      (ev) => setDeferredPrompt(ev),
      () => {
        setIsInstalled(true);
        setJustInstalled(true);
        setDeferredPrompt(null);
      }
    );

    return () => {
      mq?.removeEventListener?.('change', onDisplayModeChange);
      unsubscribe();
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = deferredPrompt || getDeferredInstallPrompt();
    if (!promptEvent) return 'unavailable';

    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      clearDeferredInstallPrompt();
      setDeferredPrompt(null);
      setIsInstalled(true);
      setJustInstalled(true);
      return 'accepted';
    }
    return 'dismissed';
  }, [deferredPrompt]);

  const isIOS = platform === 'ios-safari' || platform === 'ios-other';

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isStandalone: isStandaloneDisplayMode(),
    isIOS,
    platform,
    justInstalled,
    install,
  };
}
