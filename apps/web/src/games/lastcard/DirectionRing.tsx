import { useEffect, useState } from 'react';

/**
 * The artist's rotation arrows (assets/sprites/direction): a ring of four arrows around the pile that
 * flashes in the new direction when the direction of play changes. Spin one turn (8 frames), hold the
 * static ring a moment, fade out. With reduced motion the static ring is simply shown briefly.
 */
const files = import.meta.glob('../../assets/sprites/direction/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const url = (name: string): string | undefined =>
  Object.entries(files).find(([path]) => path.endsWith(`/${name}.svg`))?.[1];

const FRAMES = 8;
const FRAME_MS = 60;
const TURNS = 1;
const HOLD_MS = 300;
const FADE_MS = 200;
const REDUCED_MS = 700;

/** The ring is 77x93 art px around a 45x61 card at (16, 16); in em of a card that is 5em x 7em. */
const RING = { w: (77 / 45) * 5, h: (93 / 61) * 7, x: (16 / 45) * 5, y: (16 / 61) * 7 };

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Stage = { dir: 'cw' | 'ccw'; stage: 'spin' | 'hold' | 'fade'; frame: number };

export function DirectionRing({
  direction,
  trigger,
  font,
}: {
  /** 1 = clockwise, -1 = counter clockwise (the NEW direction). */
  direction: 1 | -1;
  /** Changes (to a non-zero value) every time the direction turned around. */
  trigger: number;
  /** Pixels per em of the card the ring surrounds. */
  font: number;
}) {
  const [state, setState] = useState<Stage | null>(null);

  // Load every frame once, so the spin never flickers.
  useEffect(() => {
    for (const u of Object.values(files)) new Image().src = u;
  }, []);

  useEffect(() => {
    if (!trigger) return;
    const dir = direction === 1 ? 'cw' : 'ccw';
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (reduced()) {
      setState({ dir, stage: 'hold', frame: 0 });
      at(REDUCED_MS, () => setState(null));
    } else {
      const spinMs = FRAMES * TURNS * FRAME_MS;
      setState({ dir, stage: 'spin', frame: 0 });
      for (let i = 1; i < FRAMES * TURNS; i++)
        at(i * FRAME_MS, () => setState({ dir, stage: 'spin', frame: i % FRAMES }));
      at(spinMs, () => setState({ dir, stage: 'hold', frame: 0 }));
      at(spinMs + HOLD_MS, () => setState({ dir, stage: 'fade', frame: 0 }));
      at(spinMs + HOLD_MS + FADE_MS, () => setState(null));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (!state) return null;
  const src =
    state.stage === 'spin'
      ? url(`${state.dir}-${String(state.frame).padStart(2, '0')}`)
      : url(`direction-${state.dir}`);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      data-testid="direction-ring"
      data-direction={state.dir}
      data-stage={state.stage}
      className="pointer-events-none absolute z-10"
      style={{
        fontSize: font,
        left: `${-RING.x}em`,
        top: `${-RING.y}em`,
        // Tailwind's img { max-width: 100% } would squeeze the ring into the width of the card.
        maxWidth: 'none',
        width: `${RING.w}em`,
        height: `${RING.h}em`,
        imageRendering: 'pixelated',
        opacity: state.stage === 'fade' ? 0 : 1,
        transition: `opacity ${FADE_MS}ms linear`,
      }}
    />
  );
}
