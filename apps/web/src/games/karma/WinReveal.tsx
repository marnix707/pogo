import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';

const CONFETTI = ['#FD5F55', '#009CFD', '#FDA200', '#74CCA8', '#F7F1E4', '#AE65FF'];

/** A plain face-down card: the turn (`blind-turn` in index.css) and then the flight down to the pile. */
export const BLIND_TURN_MS = 1800;
/** The flight to the pile starts before the turn has fully settled (the ease-out tail is nearly still): this much into the turn. */
export const BLIND_FLY_AT_MS = 1450;
export const BLIND_FLY_MS = 600;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Shown when someone plays their last card: the card turns over slowly in the middle of the
 * screen. The first player out (the winner) also gets confetti. It lets taps through and
 * removes itself (the parent unmounts it after a few seconds).
 */
export function WinReveal({
  card,
  label,
  winner,
  quick = false,
}: {
  card: number;
  label: string;
  winner: boolean;
  /** A plain face-down card: fast flip, light dimming, no caption. */
  quick?: boolean;
}) {
  const reduced = prefersReducedMotion();
  // A plain face-down card: once it has turned, it flies down to the pile while the dimming fades away slowly.
  const fly = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!quick || reduced) return;
    const t = setTimeout(() => {
      setLeaving(true);
      const from = face.current?.getBoundingClientRect();
      const pile = document.querySelector('[data-testid="pile-top"]')?.getBoundingClientRect();
      if (!fly.current || !from || !pile || pile.width === 0) {
        // Nowhere to land (e.g. the pile burned): the card just melts away with the dimming.
        fly.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: BLIND_FLY_MS,
          fill: 'forwards',
        });
        return;
      }
      const dx = pile.left + pile.width / 2 - (from.left + from.width / 2);
      const dy = pile.top + pile.height / 2 - (from.top + from.height / 2);
      fly.current.animate(
        [
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(${pile.width / from.width})` },
        ],
        { duration: BLIND_FLY_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
      );
    }, BLIND_FLY_AT_MS);
    return () => clearTimeout(t);
  }, [quick, reduced]);
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: `${Math.round(Math.random() * 100)}%`,
        color: CONFETTI[i % CONFETTI.length],
        // Confetti only starts once the card has finished turning over (2.5s).
        delay: `${(2.5 + Math.random() * 1.2).toFixed(2)}s`,
        duration: `${(2.4 + Math.random() * 1.8).toFixed(2)}s`,
        drift: `${Math.round(Math.random() * 120 - 60)}px`,
        spin: `${Math.round(360 + Math.random() * 540)}deg`,
        size: `${6 + Math.round(Math.random() * 6)}px`,
      })),
    [],
  );
  return (
    <div
      className={`pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 transition-colors ease-in-out ${quick ? (leaving ? 'bg-black/0' : 'bg-black/30') : 'bg-black/55'}`}
      style={quick ? { transitionDuration: `${BLIND_FLY_MS}ms` } : undefined}
      data-testid="win-reveal"
      data-winner={winner}
      aria-hidden
    >
      {winner &&
        !reduced &&
        pieces.map((p, i) => (
          <span
            key={i}
            className="confetti"
            style={
              {
                left: p.left,
                width: p.size,
                height: p.size,
                background: p.color,
                animationDelay: p.delay,
                animationDuration: p.duration,
                '--drift': p.drift,
                '--spin': p.spin,
              } as React.CSSProperties
            }
          />
        ))}
      <div ref={fly} style={{ perspective: '700px' }}>
        <div
          ref={face}
          className={reduced ? 'relative' : quick ? 'blind-card' : 'win-card'}
          style={{ width: '110px', height: '154px' }}
        >
          {!reduced && (
            <div className="win-face win-back">
              <PlayingCard faceDown size={22} className="absolute left-0 top-0" />
            </div>
          )}
          <div className="win-face win-front">
            <PlayingCard card={card} size={22} className="absolute left-0 top-0" />
          </div>
        </div>
      </div>
      {!quick && (
        <p
          className={`label rounded-md border-2 border-neon bg-panel px-4 py-2 text-sm text-ink ${
            reduced ? '' : 'win-label'
          }`}
        >
          {label}
        </p>
      )}
    </div>
  );
}
