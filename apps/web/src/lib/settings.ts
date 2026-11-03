import { useSyncExternalStore } from 'react';

export interface Settings {
  /** Sound effects volume, 0 (off) .. 100. */
  sound: number;
  /** Music volume, 0 (off) .. 100. */
  music: number;
  vibration: boolean;
  /** How strong the CRT layer over the whole app is (scanlines and a darkened edge), 0 = off .. 100. */
  crt: number;
}

const KEY = 'pogo.settings';
const defaults: Settings = { sound: 100, music: 50, vibration: true, crt: 20 };

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    // (An earlier version stored the CRT effect as a switch: that falls back to the default now.)
    const crt =
      typeof saved.crt === 'number' ? Math.min(100, Math.max(0, saved.crt)) : defaults.crt;
    // (Earlier versions stored sound as a switch, and had no music setting.)
    const volume = (v: unknown, fallback: number) =>
      typeof v === 'number' ? Math.min(100, Math.max(0, v)) : v === false ? 0 : fallback;
    return {
      ...defaults,
      ...saved,
      crt,
      sound: volume(saved.sound, defaults.sound),
      music: volume(saved.music, defaults.music),
    };
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

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getSettings);
}
