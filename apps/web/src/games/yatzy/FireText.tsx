import type { ReactNode } from 'react';

/**
 * Pixel-style fire licking round a piece of text (Balatro-ish): chunky square flames in three hot colours
 * flicker in steps behind the glyphs. `level` 1 is a small fire; every extra Yatzy makes it a bit bigger,
 * wider and busier (capped at 6).
 */
export function FireText({ level, children }: { level: number; children: ReactNode }) {
  const l = Math.max(1, Math.min(6, level));
  const flames = 3 + l * 2;
  return (
    <span className="fire-text relative inline-block" data-testid="fire-text" data-fire={l}>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[38%] left-1/2 flex -translate-x-1/2 items-end justify-center"
        style={{ width: `${1.3 + l * 0.4}em`, height: `${1.4 + l * 0.6}em` }}
      >
        {Array.from({ length: flames }, (_, i) => {
          // A deterministic "random" height and speed per flame, taller in the middle.
          const middle = 1 - Math.abs((i + 0.5) / flames - 0.5) * 1.3;
          const height = (0.45 + ((i * 37) % 10) / 22) * middle;
          return (
            <i
              key={i}
              className="fire-flame"
              style={
                {
                  '--h': `${(1 + l * 0.55) * Math.max(0.4, height * 1.35)}em`,
                  '--dur': `${380 + ((i * 53) % 5) * 70}ms`,
                  '--delay': `${-((i * 91) % 400)}ms`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </span>
      <span className="fire-glyph relative">{children}</span>
    </span>
  );
}
