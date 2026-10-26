import { useEffect, useState } from 'react';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A frame counter that ticks every `ms` (stays at 0 with reduced motion). */
export function useFrame(ms: number, active = true): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active || reduced()) return;
    const id = setInterval(() => setFrame((f) => f + 1), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return frame;
}
