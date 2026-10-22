import { useEffect, useState } from 'react';

/**
 * Card scale for this phone: shrink a little on short screens, grow on tall ones. `chromePx` is the
 * height of everything on the screen that is not cards (header, seats, buttons...): the cards get the
 * rest, about 442px per unit of scale.
 */
export function useCardScale(chromePx = 238): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return Math.max(0.72, Math.min(1.12, (h - chromePx) / 442));
}
