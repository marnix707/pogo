import { useEffect, useState } from 'react';

export const frames = Object.entries(
  import.meta.glob('../../assets/sprites/fire/fire-lofi-flame-*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The artist's flame is 18 x 24 art pixels. */
const ART_W = 18;
const ART_H = 24;

/**
 * A burning pile: the artist's lo-fi pixel flame (8 frames at 100 ms) grows smoothly out of the bottom,
 * flickers for a moment and then shrinks and fades away (`burn-fire` in index.css). `scale` = screen pixels
 * per art pixel. Standing still (one frame, no growth) with reduced motion.
 */
export function BurnFire({
  scale = 6,
  durationMs = 1500,
  delayMs = 0,
  className = '',
}: {
  scale?: number;
  durationMs?: number;
  delayMs?: number;
  className?: string;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced() || frames.length === 0) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 100);
    return () => clearInterval(id);
  }, []);
  if (frames.length === 0) return null;
  return (
    <span
      data-testid="burn-flash"
      aria-hidden
      className={`burn-fire pointer-events-none inline-block ${className}`}
      style={{
        width: ART_W * scale,
        height: ART_H * scale,
        animationDuration: `${durationMs}ms`,
        animationDelay: `${delayMs}ms`,
      }}
    >
      <img
        src={frames[frame % frames.length]}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: 'none',
          imageRendering: 'pixelated',
        }}
      />
    </span>
  );
}

/** A tiny looping lo-fi flame for text (next to the burned-cards count): the same art, no growing or fading. */
export function MiniFlame({ scale = 0.6 }: { scale?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced() || frames.length === 0) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 100);
    return () => clearInterval(id);
  }, []);
  if (frames.length === 0) return null;
  return (
    <img
      src={frames[frame % frames.length]}
      alt="burned"
      draggable={false}
      data-testid="mini-flame"
      className="inline-block align-text-bottom"
      style={{
        width: ART_W * scale,
        height: ART_H * scale,
        maxWidth: 'none',
        imageRendering: 'pixelated',
      }}
    />
  );
}
