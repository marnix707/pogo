import { useEffect, useState } from 'react';

/** How often a visible tab asks the server which build is the newest. */
const CHECK_MS = 2 * 60 * 1000;

/** True when the server's build differs from the one this page is running (unknown = never outdated). */
export function isOutdated(current: string, served: string | null | undefined): boolean {
  return typeof served === 'string' && served.length > 0 && served !== current;
}

/** The build id the server serves right now, or null when it cannot be told (offline, an HTML fallback...). */
export async function fetchServedBuild(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === 'string' ? data.build : null;
  } catch {
    return null;
  }
}

/**
 * Becomes true once the server has a newer build than this page (a deploy happened while the app was
 * open). Checks every couple of minutes while visible, when the tab comes back and when the network returns.
 */
export function useUpdateAvailable(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const served = await fetchServedBuild();
      if (!stopped && isOutdated(__BUILD_ID__, served)) setOutdated(true);
    };
    const id = setInterval(() => void check(), CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);
  return outdated;
}
