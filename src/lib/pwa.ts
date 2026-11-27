import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type PWAPlatformKind =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chromium'
  | 'desktop-edge'
  | 'desktop-chrome'
  | 'other';

let earlyDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(ev: BeforeInstallPromptEvent | null) => void>();
const installedListeners = new Set<() => void>();
let globalListenersAttached = false;

export function attachEarlyPWAListeners(): void {
  if (typeof window === 'undefined' || globalListenersAttached) return;
  globalListenersAttached = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    earlyDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb(earlyDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    earlyDeferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
    installedListeners.forEach((cb) => cb());
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return earlyDeferredPrompt;
}

export function clearDeferredInstallPrompt(): void {
  earlyDeferredPrompt = null;
  promptListeners.forEach((cb) => cb(null));
}

export function subscribeInstallPrompt(
  onPrompt: (ev: BeforeInstallPromptEvent | null) => void,
  onInstalled: () => void
): () => void {
  attachEarlyPWAListeners();
  promptListeners.add(onPrompt);
  installedListeners.add(onInstalled);
  if (earlyDeferredPrompt) {
    onPrompt(earlyDeferredPrompt);
  }
  return () => {
    promptListeners.delete(onPrompt);
    installedListeners.delete(onInstalled);
  };
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneQuery = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const minimalUiQuery = window.matchMedia?.('(display-mode: minimal-ui)').matches ?? false;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return standaloneQuery || minimalUiQuery || iosStandalone;
}

export function detectPWAPlatform(): PWAPlatformKind {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|opios/.test(ua);
    return isSafari ? 'ios-safari' : 'ios-other';
  }
  if (/android/.test(ua)) {
    return 'android-chromium';
  }
  if (/edg\//.test(ua)) {
    return 'desktop-edge';
  }
  if (/chrome|chromium|crios/.test(ua) && !/opr\//.test(ua)) {
    return 'desktop-chrome';
  }
  return 'other';
}

export interface PWAUpdateController {
  checkForUpdates: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  cleanup: () => void;
}

const updateReadyListeners = new Set<() => void>();
let activeUpdateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let updateIsWaiting = false;

export function subscribePWAUpdates(onNeedRefresh: () => void): () => void {
  updateReadyListeners.add(onNeedRefresh);
  if (updateIsWaiting) onNeedRefresh();
  return () => {
    updateReadyListeners.delete(onNeedRefresh);
  };
}

export async function triggerPWAUpdate(): Promise<void> {
  if (activeUpdateSW) {
    await activeUpdateSW(true);
  }
}

export function initServiceWorker(): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  attachEarlyPWAListeners();

  let registrationRef: ServiceWorkerRegistration | undefined;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateIsWaiting = true;
      updateReadyListeners.forEach((cb) => cb());
    },
    onOfflineReady() {
      // App shell precached and ready for offline access
    },
    onRegisteredSW(_swUrl, registration) {
      registrationRef = registration;
      if (registration && !intervalId) {
        intervalId = setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 60 * 60 * 1000);
      }
    },
  });

  activeUpdateSW = updateSW;

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine && registrationRef) {
      registrationRef.update().catch(() => {});
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
