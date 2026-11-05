import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { SCREEN_H, SCREEN_W } from './screenArt';

/**
 * CSS pixels per art pixel for the 290 x 432 screen in `ref`: a whole number of DEVICE pixels per art pixel (the
 * pixel art is never smoothed or drawn with uneven pixels), as big as the box allows.
 */
export function useStageScale(ref: RefObject<HTMLElement>): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const per = Math.floor(
        Math.min((el.clientWidth * dpr) / SCREEN_W, (el.clientHeight * dpr) / SCREEN_H),
      );
      setScale(Math.max(1, per) / dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}
