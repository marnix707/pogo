import { useSyncExternalStore } from 'react';

/** Chrome/Edge/Android fire this when the app can be installed; iOS never does. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** Already running from the home screen (fullscreen), so there is nothing to install. */
  standalone: boolean;
  /** iPhone / iPad: installing means Share -> Add to Home Screen. */
  ios: boolean;
  /** The browser offered a one-tap install prompt. */
  canPrompt: boolean;
  /** Chrome / Firefox / Edge on iPhone (they all use WebKit, but their home-screen shortcuts can differ). */
  iosThirdPartyBrowser: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function compute(): InstallState {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const ios =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
  const iosThirdPartyBrowser = ios && /crios|fxios|edgios/i.test(navigator.userAgent);
  return { standalone, ios, canPrompt: deferred !== null, iosThirdPartyBrowser };
}

let snapshot: InstallState | undefined;
function refresh() {
  snapshot = compute();
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    refresh();
  });
}

function getSnapshot(): InstallState {
  snapshot ??= compute();
  return snapshot;
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const event = deferred;
  deferred = null; // a prompt can only be used once
  refresh();
  await event.prompt();
  await event.userChoice;
}

export function useInstall(): InstallState & { prompt: () => Promise<void> } {
  const state = useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getSnapshot);
  return { ...state, prompt: promptInstall };
}

const DISMISS_KEY = 'pogo.installDismissed';

export function readInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeInstallDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Storage unavailable: the banner just comes back next visit.
  }
}
