import { useSyncExternalStore } from 'react';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  /** How strong the CRT layer over the whole app is (scanlines and a darkened edge), 0 = off .. 100. */
  crt: number;
}

const KEY = 'pogo.settings';
const defaults: Settings = { sound: true, vibration: true, crt: 20 };

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    // (An earlier version stored the CRT effect as a switch: that falls back to the default now.)
    const crt =
      typeof saved.crt === 'number' ? Math.min(100, Math.max(0, saved.crt)) : defaults.crt;
    return { ...defaults, ...saved, crt };
  } catch {
    return defaults;
  }
}

let current = load();
const listeners = new Set<() => void>();

function applyLook() {
  const root = document.documentElement;
  root.classList.toggle('crt', current.crt > 0);
  root.style.setProperty('--crt', String(current.crt / 100));
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
