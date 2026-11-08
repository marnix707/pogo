import { useEffect, useState } from 'react';

/**
 * Is a phone held sideways? Read from the device's own orientation (the screen), never from the size of the page:
 * the on-screen keyboard shrinks the page until it is "wide and short", which looks like a landscape window but is
 * not the phone being turned.
 */
function sideways(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!coarse) return false;
  const type = window.screen?.orientation?.type;
  const landscape = type
    ? type.startsWith('landscape')
    : Math.abs(Number((window as unknown as { orientation?: number }).orientation ?? 0)) === 90;
  const small = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) <= 500;
  return landscape && small;
}

export function useSideways(): boolean {
  const [on, setOn] = useState(sideways);
  useEffect(() => {
    const update = () => setOn(sideways());
    window.addEventListener('orientationchange', update);
    window.screen?.orientation?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('orientationchange', update);
      window.screen?.orientation?.removeEventListener?.('change', update);
    };
  }, []);
  return on;
}
