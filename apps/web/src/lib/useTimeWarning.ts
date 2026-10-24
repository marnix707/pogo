import { useEffect, useRef } from 'react';
import { play } from './sound';

/** Plays the "time is running out" beep once a second while `active` and 10 seconds or fewer are left. */
export function useTimeWarning(secondsLeft: number | null, active: boolean) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!active || secondsLeft === null || secondsLeft > 10 || secondsLeft < 1) {
      last.current = null;
      return;
    }
    if (last.current === secondsLeft) return;
    last.current = secondsLeft;
    play('hurry');
  }, [active, secondsLeft]);
}
