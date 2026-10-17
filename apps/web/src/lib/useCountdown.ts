import { useEffect, useMemo, useState } from 'react';

/** Whole seconds until `deadline` (server clock), or null when there is no deadline. */
export function useCountdown(
  deadline: number | null | undefined,
  serverTime: number,
): number | null {
  // Correct for the difference between the server's clock and this device's clock.
  const skew = useMemo(() => serverTime - Date.now(), [serverTime]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadline == null) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - (Date.now() + skew)) / 1000));
}
