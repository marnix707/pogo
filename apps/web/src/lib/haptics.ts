import { getSettings } from './settings';

const PATTERNS = {
  tap: 10,
  roll: [15, 30, 15, 30, 15],
  success: [20, 40, 20],
  error: [60, 40, 60],
} as const;

/** Vibrate where supported (Android browsers; iOS Safari ignores it). */
export function haptic(kind: keyof typeof PATTERNS) {
  if (!getSettings().vibration) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    // Not supported or blocked: no feedback, no problem.
  }
}
