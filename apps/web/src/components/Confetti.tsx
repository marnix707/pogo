import { useMemo } from 'react';

const COLORS = ['#FD5F55', '#009CFD', '#FDA200', '#74CCA8', '#F7F1E4', '#AE65FF'];

/**
 * Falling confetti over the whole screen (taps pass through). `startS` seconds until the first
 * pieces fall; pieces start within about a second after that. Hidden with reduced motion (`.confetti`).
 */
export function Confetti({ startS = 0, count = 56 }: { startS?: number; count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${Math.round(Math.random() * 100)}%`,
        color: COLORS[i % COLORS.length],
        delay: `${(startS + Math.random() * 1.2).toFixed(2)}s`,
        duration: `${(2.4 + Math.random() * 1.8).toFixed(2)}s`,
        drift: `${Math.round(Math.random() * 120 - 60)}px`,
        spin: `${Math.round(360 + Math.random() * 540)}deg`,
        size: `${6 + Math.round(Math.random() * 6)}px`,
      })),
    [count, startS],
  );
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="confetti"
      aria-hidden
    >
      {pieces.map((p, i) => (
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
    </div>
  );
}
