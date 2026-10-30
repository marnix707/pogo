import { useEffect, useState } from 'react';

/** Poll `load` every `ms` and keep the latest result. */
export function useLive<T>(
  load: () => Promise<T>,
  onError: (m: string) => void,
  ms = 0,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    const run = () =>
      load()
        .then((d) => live && setData(d))
        .catch((e: Error) => onError(e.message));
    void run();
    const t = ms > 0 ? setInterval(run, ms) : undefined;
    return () => {
      live = false;
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}
