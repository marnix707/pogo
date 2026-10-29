import { useEffect, useState } from 'react';
import type { BellMessage } from '@pogo/shared';
import bellUrl from '../assets/sprites/ui/bell-animated.svg';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';
import { PlayerName } from './PlayerName';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHOW_MS = 2600;

/** The sprite of the Ring the bell button and banner: the artist-style bell that swings (frames, not a rotation). */
export const bellSprite = bellUrl;

/**
 * Somebody rang the bell in your lobby (an old-school chat nudge): the whole screen shakes, a loud silly bell rings,
 * the phone buzzes and a banner says who is calling. Mounted once in the Shell.
 */
export function BellFx({ me }: { me: string }) {
  const [bell, setBell] = useState<(BellMessage & { key: number }) | null>(null);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    let shake: ReturnType<typeof setTimeout> | undefined;
    const onBell = (e: Event) => {
      const from = (e as CustomEvent<BellMessage>).detail;
      setBell({ ...from, key: Date.now() });
      play('bell');
      haptic('bell');
      const root = document.getElementById('root');
      // The pop-up, the sound and the shake are for everybody in the lobby, the ringer too.
      if (root && !reduced()) {
        root.classList.remove('bell-shake');
        void root.offsetWidth; // restart the animation when the bell rings twice
        root.classList.add('bell-shake');
        clearTimeout(shake);
        shake = setTimeout(() => root.classList.remove('bell-shake'), 1500);
      }
      clearTimeout(hide);
      hide = setTimeout(() => setBell(null), SHOW_MS);
    };
    window.addEventListener('pogo:bell', onBell);
    return () => {
      window.removeEventListener('pogo:bell', onBell);
      clearTimeout(hide);
      clearTimeout(shake);
    };
  }, []);

  if (!bell) return null;
  return (
    <div
      key={bell.key}
      role="alert"
      data-testid="bell-banner"
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[60] w-[min(94vw,30rem)] rounded-lg border-4 border-neon bg-panel px-4 pb-3 pt-2 shadow-[0_8px_0_#101628]"
      style={{ animation: `bell-banner ${SHOW_MS}ms ease-out both` }}
    >
      <div className="flex items-center justify-center gap-3">
        <img
          src={bellUrl}
          alt=""
          draggable={false}
          className="h-14 w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
        <span
          data-testid="bell-title"
          className="min-w-0 truncate text-3xl font-black uppercase leading-tight tracking-wider text-neon"
        >
          <PlayerName name={bell.nickname} />
        </span>
        <img
          src={bellUrl}
          alt=""
          draggable={false}
          className="h-14 w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <p className="mt-1 w-full text-center text-sm font-bold uppercase tracking-[0.12em] text-ink">
        {bell.fromId === me ? 'You rang the bell!' : 'rings the bell! Everybody get ready!'}
      </p>
    </div>
  );
}
