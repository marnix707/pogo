import { useSyncExternalStore } from 'react';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  /** The CRT layer over the whole app: scanlines and a darkened edge. */
  crt: boolean;
}

const KEY = 'pogo.settings';
const defaults: Settings = { sound: true, vibration: true, crt: true };

function load(): Settings {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return defaults;
  }
}

let current = load();
const listeners = new Set<() => void>();

function applyLook() {
  document.documentElement.classList.toggle('crt', current.crt);
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: settings just won't persist.
  }
  applyLook();
  listeners.forEach((l) => l());
}

/** Call once at startup: applies the saved look (the CRT layer). */
export function initTheme() {
  applyLook();
}

export function useSettings(): Settings {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getSettings);
}
