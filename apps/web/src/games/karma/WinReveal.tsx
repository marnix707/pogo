import { useMemo } from 'react';
import { PlayingCard } from './PlayingCard';

const CONFETTI = ['#FF4C40', '#009DFF', '#F5B828', '#3DDC84', '#F4EEDB', '#B06CFF'];

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
}: {
  card: number;
  label: string;
  winner: boolean;
}) {
  const reduced = prefersReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: `${Math.round(Math.random() * 100)}%`,
        color: CONFETTI[i % CONFETTI.length],
        // Confetti only starts once the card has finished turning over (3.12s).
        delay: `${(3.12 + Math.random() * 1.2).toFixed(2)}s`,
        duration: `${(2.4 + Math.random() * 1.8).toFixed(2)}s`,
        drift: `${Math.round(Math.random() * 120 - 60)}px`,
        spin: `${Math.round(360 + Math.random() * 540)}deg`,
        size: `${6 + Math.round(Math.random() * 6)}px`,
      })),
    [],
  );
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/55"
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
      <div style={{ perspective: '700px' }}>
        <div
          className={reduced ? 'relative' : 'win-card'}
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
      <p
        className={`label rounded-md border-2 border-neon bg-panel px-4 py-2 text-sm text-ink ${
          reduced ? '' : 'win-label'
        }`}
      >
        {label}
      </p>
    </div>
  );
}
