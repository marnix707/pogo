import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * CSS pixels per art pixel for a box of `artPx` art pixels in `ref`: a whole number of DEVICE pixels per art
 * pixel (the pixel art must never be smoothed or drawn with uneven pixels), as big as the box allows; with `fill`
 * the box is filled exactly.
 */
export function useArtScale(
  ref: RefObject<HTMLElement>,
  artPx: number,
  /** Fill the whole width (the pixels are then not all the same size) instead of a whole number per art pixel. */
  fill = false,
  /** With `fill`: also fit this many art pixels into the box's height (the smaller scale wins). */
  artH?: number,
): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      if (fill)
        return setScale(
          artH ? Math.min(el.clientWidth / artPx, el.clientHeight / artH) : el.clientWidth / artPx,
        );
      const dpr = window.devicePixelRatio || 1;
      const deviceW = el.clientWidth * dpr;
      const perArt = Math.max(1, Math.floor(deviceW / artPx));
      setScale(perArt / dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, artPx, fill, artH]);
  return scale;
}
