import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { SCREEN_H, SCREEN_W } from './screenArt';

/**
 * CSS pixels per art pixel for the 290 art pixel wide screen in `ref`: a whole number of DEVICE pixels per art pixel,
 * as big as the width allows; and the height in art pixels the screen may use.
 */
export function useStageScale(
  ref: RefObject<HTMLElement>,
  /** An element above the screen (the phone's top safe area), whose height is not part of it. */
  above?: RefObject<HTMLElement>,
): { s: number; h: number; w: number } {
  const [state, setState] = useState({ s: 1, h: SCREEN_H, w: SCREEN_W });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const per = Math.max(1, Math.floor((el.clientWidth * dpr) / SCREEN_W));
      // A whole number of device pixels per art pixel when that fills the width (phones); on a wide window it
      // would leave the screen small beside the board, so then it scales with the width instead.
      const s = (per * SCREEN_W) / dpr >= el.clientWidth * 0.95 ? per / dpr : el.clientWidth / SCREEN_W;
      // how many art pixels high the screen may be (the layout stretches to use it)
      const h = Math.floor((el.clientHeight - (above?.current?.offsetHeight ?? 0)) / s);
      const w = el.clientWidth;
      setState((cur) => (cur.s === s && cur.h === h && cur.w === w ? cur : { s, h, w }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, above]);
  return state;
}
