import { useEffect, useState } from 'react';
import { cardBackUrl } from './cardArt';

const FX_MS = 1500;

/** Shows its children for FX_MS every time `trigger` changes to a non-zero value. */
function useShown(trigger: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    setShown(trigger);
    const t = setTimeout(() => setShown(0), FX_MS);
    return () => clearTimeout(t);
  }, [trigger]);
  return shown;
}

/**
 * "3 ate 8": a Pac-Man (drawn with CSS: a yellow disc whose two halves chomp) rolls across the table and
 * eats a big 8, crumbs fly, CRUNCH! The crunch sound is played by the caller.
 */
export function PacmanBite({ trigger }: { trigger: number }) {
  const shown = useShown(trigger);
  if (!shown) return null;
  return (
    <div
      key={shown}
      aria-hidden
      data-testid="pacman-bite"
      className="pacman-fx pointer-events-none fixed inset-x-0 top-[28%] z-40 h-24 overflow-hidden"
    >
      <div className="pacman-run absolute left-0 top-2 h-20 w-20">
        <span className="pacman-top absolute inset-x-0 top-0 h-10 rounded-t-full bg-[#ffd23f] shadow-[0_0_0_3px_#101628]" />
        <span className="pacman-bottom absolute inset-x-0 bottom-0 h-10 rounded-b-full bg-[#ffd23f] shadow-[0_0_0_3px_#101628]" />
        <span className="absolute left-[46%] top-3 h-3 w-3 rounded-full bg-[#101628]" />
      </div>
      <span className="pacman-eight absolute left-[56%] top-1 flex h-20 w-14 items-center justify-center rounded-lg border-[3px] border-[#101628] bg-[#f7f1e4] text-5xl font-bold leading-none text-[#101628]">
        8
      </span>
      <span
        className="pacman-crunch absolute left-[50%] top-0 whitespace-nowrap font-bold uppercase leading-none text-white"
        style={{
          fontSize: 28,
          textShadow:
            '0.04em 0 0 #fff, 0 0.06em 0 #d9382f, 0.08em 0.1em 0 #101628, 0 0.18em 0.14em rgb(0 0 0 / 0.45)',
        }}
      >
        Crunch!
      </span>
    </div>
  );
}

/** "Big hand": a hand gives you one extra card. */
export function BigHandGive({ trigger }: { trigger: number }) {
  const shown = useShown(trigger);
  if (!shown) return null;
  const back = cardBackUrl;
  return (
    <div
      key={shown}
      aria-hidden
      data-testid="bighand-give"
      className="bighand-fx pointer-events-none fixed inset-x-0 bottom-[34%] z-40 flex justify-center"
    >
      <div className="relative h-28 w-48">
        <img
          src={back}
          alt=""
          draggable={false}
          className="bighand-card absolute left-1/2 top-0 h-24 -translate-x-1/2"
          style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 4px 0 #101628)' }}
        />
        <span className="bighand-hand absolute left-1/2 top-12 -translate-x-1/2 text-7xl leading-none drop-shadow-[0_4px_0_#101628]">
          🫴
        </span>
        <span
          className="bighand-plus absolute -right-4 top-2 whitespace-nowrap font-bold uppercase leading-none text-white"
          style={{
            fontSize: 22,
            textShadow:
              '0.04em 0 0 #fff, 0.08em 0.1em 0 #101628, 0 0.18em 0.14em rgb(0 0 0 / 0.45)',
          }}
        >
          +1 card
        </span>
      </div>
    </div>
  );
}
