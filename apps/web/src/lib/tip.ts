import { useSyncExternalStore } from 'react';

/**
 * One tooltip open at a time, everywhere in the app. Tap its trigger (anything with `data-tip-trigger`) to open
 * it; tap anywhere else on the screen to close it; tap another trigger and the open one fades out while the new
 * one fades in (see `TipBubble`).
 */
let active: string | null = null;
const listeners = new Set<() => void>();
const set = (id: string | null) => {
  if (active === id) return;
  active = id;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

if (typeof document !== 'undefined') {
  // (capture phase: runs before the tapped thing's own handler; a tap on a trigger is left to that trigger)
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (active === null) return;
      if ((e.target as Element | null)?.closest?.('[data-tip-trigger]')) return;
      set(null);
    },
    true,
  );
}

/** The tooltip `id`: is it open, toggle it (opens it and closes any other), close it. */
export function useTip(id: string) {
  const open = useSyncExternalStore(
    subscribe,
    () => active === id,
    () => false,
  );
  return {
    open,
    toggle: () => set(active === id ? null : id),
    close: () => active === id && set(null),
  };
}

export const closeTip = () => set(null);

/** Which tooltip is open now (for screens that draw many of them from one place). */
export const useActiveTip = () =>
  useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
export const toggleTip = (id: string) => set(active === id ? null : id);
