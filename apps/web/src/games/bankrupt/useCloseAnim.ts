import { useEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A pop-up that closes nicely: `run(fn)` plays the closing animation (`closing` is true, put the `bk-pop-out`
 * class on the pop-up) and calls `fn` when it is over. A second tap while it closes does nothing.
 */
export function useCloseAnim(ms = 200) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = (fn: () => void) => {
    if (closing) return;
    if (reduced()) return fn();
    setClosing(true);
    timer.current = setTimeout(fn, ms);
  };
  return { closing, run };
}
