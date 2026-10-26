import { useEffect, useState } from 'react';

const frames = Object.entries(
  import.meta.glob('../../assets/sprites/fire/fire-lofi-flame-*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Flame art size in art pixels (`fire-lofi-flame-*.svg`). */
const FLAME_W = 18;
const FLAME_H = 24;

/**
 * Lo-fi pixel fire (the artist's 8-frame flame, 100 ms a frame) burning behind a Yatzy "50": `level` is the
 * number of Yatzys hit. Level 1 is a medium flame; every further Yatzy makes it bigger and, from level 3 on, adds
 * another flame beside it (capped at 6). Sits at the bottom of its (relative) parent, behind the text.
 */
export function Flames({ level }: { level: number }) {
  const l = Math.max(1, Math.min(6, level));
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reducedMotion() || frames.length === 0) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 100);
    return () => clearInterval(id);
  }, []);
  if (frames.length === 0) return null;
  const scale = 0.6 + l * 0.3; // whole-pixel scaling is not possible at this size; keep it crisp anyway
  const count = l >= 5 ? 3 : l >= 3 ? 2 : 1;
  return (
    <span
      aria-hidden
      data-testid="yatzy-flames"
      data-fire={l}
      className="pointer-events-none absolute bottom-0 left-1/2 flex -translate-x-1/2 items-end justify-center"
    >
      {Array.from({ length: count }, (_, i) => (
        <img
          key={i}
          src={frames[(frame + i * 3) % frames.length]}
          alt=""
          draggable={false}
          style={{
            width: FLAME_W * scale,
            height: FLAME_H * scale,
            maxWidth: 'none',
            imageRendering: 'pixelated',
            marginLeft: i === 0 ? 0 : -FLAME_W * scale * 0.25,
          }}
        />
      ))}
    </span>
  );
}
