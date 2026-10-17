import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  sound: boolean;
  vibration: boolean;
  theme: Theme;
}

const KEY = 'pogo.settings';
const defaults: Settings = { sound: true, vibration: true, theme: 'system' };

function load(): Settings {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return defaults;
  }
}

let current = load();
const listeners = new Set<() => void>();

function applyTheme() {
  const dark =
    current.theme === 'dark' ||
    (current.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
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
  applyTheme();
  listeners.forEach((l) => l());
}

/** Call once at startup: applies the theme and follows OS changes while on "system". */
export function initTheme() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

export function useSettings(): Settings {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getSettings);
}
