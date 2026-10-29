import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Pixels per second the text moves while it scrolls (slow, so it can be read). */
const SPEED = 40;
const PAUSE_MS = 1000;

/**
 * One line that is cut off when it does not fit: after a pause it scrolls slowly until its end shows,
 * waits, jumps back to the start and repeats. Text that fits just stays put.
 */
export function Marquee({ children, className = '' }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    const at = (delay: number, fn: () => void) => {
      timers.push(setTimeout(() => !stopped && fn(), delay));
    };
    const cycle = () => {
      const over = (text.current?.scrollWidth ?? 0) - (box.current?.clientWidth ?? 0);
      if (over <= 1) {
        at(1000, cycle); // it may change size (fonts, a longer name): look again later
        return;
      }
      const run = Math.max(600, (over / SPEED) * 1000);
      setMs(0);
      setShift(0);
      at(PAUSE_MS, () => {
        setMs(run);
        setShift(over);
        at(run + PAUSE_MS, cycle);
      });
    };
    at(0, cycle);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={box} className={`overflow-hidden ${className}`}>
      <div
        ref={text}
        className="w-max whitespace-nowrap motion-reduce:transition-none"
        style={{
          transform: `translateX(${-shift}px)`,
          transition: ms ? `transform ${ms}ms linear` : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
