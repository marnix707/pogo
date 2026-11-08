/**
 * What a bug report carries about the app: recent errors, extras that screens register, and the browser. The page
 * is assembled by `Shell` (screen, room, user ...) through `setBugContext`; nothing here ever holds a token.
 */
export interface CapturedError {
  at: number;
  kind: 'error' | 'rejection' | 'console';
  message: string;
}

const MAX_ERRORS = 20;
const errors: CapturedError[] = [];

const text = (v: unknown): string => {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export function recordError(kind: CapturedError['kind'], value: unknown, at = Date.now()) {
  errors.push({ at, kind, message: text(value).slice(0, 500) });
  if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
}
export const recentErrors = (): CapturedError[] => [...errors];

/** Starts collecting errors (call once, early). */
export function installErrorCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => recordError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => recordError('rejection', e.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recordError('console', args.map(text).join(' '));
    original(...args);
  };
}

// ---- extras that screens register (e.g. Bankrupt's animation state) ----------------------------

const registry = new Map<string, () => unknown>();
/** Registers something to attach to a report; returns the function that removes it again. */
export function registerDiagnostics(key: string, read: () => unknown): () => void {
  registry.set(key, read);
  return () => {
    if (registry.get(key) === read) registry.delete(key);
  };
}
export function collectExtras(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, read] of registry) {
    try {
      out[key] = read();
    } catch (e) {
      out[key] = `[could not read: ${text(e)}]`;
    }
  }
  return out;
}

// ---- the context a screen supplies ---------------------------------------------------------------

type ContextReader = () => Record<string, unknown>;
let reader: ContextReader | null = null;
/** Shell (or the sign-in screen) tells the report what to attach; returns the function that removes it. */
export function setBugContext(read: ContextReader): () => void {
  reader = read;
  return () => {
    if (reader === read) reader = null;
  };
}

/** Anything that looks like a secret is dropped before it leaves the browser. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[too deep]';
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = /token|authorization|password|secret|cookie/i.test(k)
        ? '[removed]'
        : scrub(v, depth + 1);
    return out;
  }
  return value;
}

export function browserInfo(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const nav = window.navigator;
  return {
    userAgent: nav.userAgent,
    language: nav.language,
    online: nav.onLine,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screen: { w: window.screen?.width, h: window.screen?.height },
    devicePixelRatio: window.devicePixelRatio,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    url: `${window.location.pathname}${window.location.search ? '?…' : ''}`,
  };
}

/** Everything the app knows about itself right now, ready to be sent with a report. */
export function collectBugContext(): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  try {
    base = reader?.() ?? {};
  } catch (e) {
    base = { contextError: text(e) };
  }
  return scrub({
    ...base,
    browser: browserInfo(),
    errors: recentErrors(),
    extras: collectExtras(),
    sentAt: new Date().toISOString(),
  }) as Record<string, unknown>;
}
