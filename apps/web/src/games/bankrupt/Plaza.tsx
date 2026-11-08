import { useEffect, useRef } from 'react';
import { bankrupt } from '@pogo/shared';
import { play } from '../../lib/sound';
import { createWheel } from './wheel';
import type { Wheel } from './wheel';

const sprites = import.meta.glob('../../assets/sprites/bankrupt/plaza/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const url = (name: string) => sprites[`../../assets/sprites/bankrupt/plaza/${name}.svg`] ?? '';

/** The inside of the board is 193 x 193 art px; the canvas is drawn at 4 px per art px and scaled by the page. */
export const INSIDE = 193;
const S = 4;
/** Where Pogo's hub sits (art px of the inside, 19 x 19). */
export const HUB = { x: 97 - 9.5, y: 93 - 9.5, size: 19 };
const WHEEL = { cx: 96, cy: 92, r: 46 };
/** The trees of the plaza (art px of the inside, from the artist's picture): triple-tap one for a surprise. */
const TREES: [number, number][] = [
  [26, 40],
  [35, 45],
  [27, 55],
  [38, 66],
  [25, 73],
  [67, 37],
  [123, 37],
  [162, 40],
  [153, 49],
  [164, 70],
  [28, 124],
  [39, 133],
  [29, 143],
  [44, 150],
  [63, 153],
  [55, 139],
  [74, 164],
  [125, 153],
  [137, 141],
  [150, 150],
  [169, 143],
  [155, 133],
  [166, 124],
  [115, 166],
];
const TREE_R = 7;
const EGG_COOLDOWN_MS = 5000;

const images = new Map<string, HTMLImageElement>();
const img = (name: string) => {
  let i = images.get(name);
  if (!i) {
    i = new Image();
    i.src = url(name);
    images.set(name, i);
  }
  return i;
};
/** A picture at its art size (the files are 3 or 4 times bigger: their viewBox is the art size). */
const artSize = (i: HTMLImageElement, name: string) => {
  const k = name === 'board-inside-plaza' ? 3 : 4;
  return { w: i.naturalWidth / k, h: i.naturalHeight / k };
};
/**
 * The pictures are SVGs: drawing an SVG into a canvas every frame makes the browser rasterise it every frame (slow,
 * and the screen stutters). Each is drawn once into a small canvas at its final size and blitted from there.
 */
const rasters = new Map<string, HTMLCanvasElement>();
const raster = (name: string): HTMLCanvasElement | null => {
  const hit = rasters.get(name);
  if (hit) return hit;
  const i = img(name);
  if (!i.complete || !i.naturalWidth) return null;
  const { w, h } = artSize(i, name);
  const c = document.createElement('canvas');
  c.width = Math.round(w * S);
  c.height = Math.round(h * S);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(i, 0, 0, c.width, c.height);
  rasters.set(name, c);
  return c;
};

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What the wheel is told to do when a roll happens: land on a slice of the set that was spun. */
export interface Spin {
  /** Changes with every roll. */
  key: number;
  slices: readonly string[];
  /** The slice it stops on (the special wheel's is the server's; a normal roll's is any slice with the value). */
  idx: number;
  /** How long it turns, ms. */
  ms: number;
}

/**
 * The inside of the board: the town plaza with the spin wheel in the middle (the artist's pack), a fountain, cloud
 * shadows and birds. The wheel is the die: when a roll comes in it spins onto the number the game rolled. The hub
 * Pogo is a real image on top (it is where the money flies to and from: `bk-hall`).
 */
export function Plaza({
  idleSlices,
  spin,
  onTap,
  tappable,
  onBlink,
  hubColour = 'green',
}: {
  /** The slices shown while it stands still (the special set when the next roll is the special wheel). */
  idleSlices: readonly string[];
  spin: Spin | null;
  onTap?: () => void;
  tappable: boolean;
  /** Called with true / false on the beat of the winning slice's white blink (so the landing space can blink along). */
  onBlink?: (on: boolean) => void;
  /** The frog on the hub wears the colour of the player whose turn it is. */
  hubColour?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wheel = useRef<Wheel | null>(null);
  const idle = useRef(idleSlices);
  idle.current = idleSlices;
  const spun = useRef<number | null>(null);
  const blink = useRef(onBlink);
  blink.current = onBlink;
  const blinking = useRef(false);
  // easter egg: a bird flies out of a tree that was tapped three times
  const eggBirds = useRef<{ x: number; y: number; vx: number; vy: number; born: number }[]>([]);
  const taps = useRef<{ tree: number; n: number; at: number }>({ tree: -1, n: 0, at: 0 });
  const eggAt = useRef(0);

  // the wheel and its animation loop
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const w = createWheel(WHEEL.r, idle.current);
    w.onTick = () => play('tick');
    wheel.current = w;
    const still = reduced();
    let raf = 0;
    let last = 0;
    let birds: { x: number; y: number; born: number; vy: number }[] = [];
    let nextBirds = 3000;
    const draw = (name: string, x: number, y: number) => {
      const r = raster(name);
      if (r) ctx.drawImage(r, Math.round(x) * S, Math.round(y) * S);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // (30 frames a second are plenty; a still wheel with no animations only needs the lights now and then)
      if (now - last < 33) return;
      const dt = last ? now - last : 33;
      last = now;
      if (!w.spinning) w.slices = idle.current;
      w.update(now);
      const on = w.flashOn(now);
      if (on !== blinking.current) {
        blinking.current = on;
        blink.current?.(on);
      }
      ctx.clearRect(0, 0, INSIDE * S, INSIDE * S);
      draw('board-inside-plaza', 0, 0);
      draw(`fountain-${still ? 0 : Math.floor(now / 140) % 4}`, 96 - 7.5, 158 - 7.5);
      if (!still) {
        // two cloud shadows drift to the right
        const ci = raster('cloud-shadow');
        if (ci) {
          const cw = ci.width / S;
          const span = INSIDE + cw;
          ctx.save();
          ctx.beginPath();
          ctx.rect(S, S, (INSIDE - 2) * S, (INSIDE - 2) * S);
          ctx.clip();
          // (no globalAlpha: the SVG itself is already drawn at 13 % opacity; both would make it invisible)
          [30, 120].forEach((y, k) => {
            const x = (((now / 1000) * 4 + (k * span) / 2) % span) - cw;
            ctx.drawImage(ci, Math.round(x) * S, y * S);
          });
          ctx.restore();
        }
      }
      // the wheel's shadow, the wheel, the pointer
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#101628';
      ctx.beginPath();
      ctx.arc(
        (WHEEL.cx + 2 + 0.5) * S,
        (WHEEL.cy + 3 + 0.5) * S,
        (WHEEL.r + 0.5) * S,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      ctx.drawImage(
        w.render(now),
        (WHEEL.cx - WHEEL.r) * S,
        (WHEEL.cy - WHEEL.r) * S,
        (2 * WHEEL.r + 1) * S,
        (2 * WHEEL.r + 1) * S,
      );
      draw(w.pointerFlicked(now) ? 'pointer-1' : 'pointer-0', 92, 40);
      // the easter-egg birds (also with reduced motion: it is a tap's reward, and it is short)
      eggBirds.current = eggBirds.current.filter(
        (b) => b.x > -10 && b.x < INSIDE + 10 && b.y > -10 && b.y < INSIDE + 10,
      );
      for (const b of eggBirds.current) {
        b.x += (b.vx * dt) / 1000;
        b.y += (b.vy * dt) / 1000;
        const r = raster(`bird-${Math.floor((now - b.born) / 130) % 2 === 0 ? 0 : 1}`);
        if (r) {
          ctx.save();
          ctx.translate(Math.round(b.x) * S, Math.round(b.y) * S);
          if (b.vx < 0) ctx.scale(-1, 1);
          ctx.drawImage(r, 0, 0);
          ctx.restore();
        }
      }
      if (!still) {
        // birds, on top of everything
        if (now > nextBirds) {
          const n = 1 + Math.floor(Math.random() * 3);
          const y0 = 20 + Math.random() * 150;
          for (let i = 0; i < n; i++)
            birds.push({
              x: -10 - i * 9,
              y: y0 + (i % 2) * 6,
              born: now + i * 40,
              vy: (Math.random() - 0.5) * 8,
            });
          nextBirds = now + (6 + Math.random() * 5) * 1000;
        }
        birds = birds.filter((b) => b.x < INSIDE + 7);
        for (const b of birds) {
          b.x += (40 * dt) / 1000;
          b.y += (b.vy * dt) / 1000;
          draw(`bird-${Math.floor((now - b.born) / 160) % 2 === 0 ? 0 : 1}`, b.x, b.y);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (blinking.current) blink.current?.(false);
    };
  }, []);

  // a roll came in: spin onto its slice
  useEffect(() => {
    const w = wheel.current;
    if (!spin || !w || spun.current === spin.key) return;
    spun.current = spin.key;
    w.slices = spin.slices;
    w.spinToIndex(spin.idx, performance.now(), reduced() ? 1 : spin.ms);
  }, [spin]);

  const pct = (v: number) => `${(v / INSIDE) * 100}%`;
  return (
    <div className="relative h-full w-full" data-testid="bk-plaza">
      <canvas
        ref={canvas}
        width={INSIDE * S}
        height={INSIDE * S}
        data-testid="bk-wheel"
        aria-label="The wheel"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * INSIDE;
          const y = ((e.clientY - r.top) / r.height) * INSIDE;
          const tree = TREES.findIndex(([tx, ty]) => Math.hypot(tx - x, ty - y) <= TREE_R);
          if (tree >= 0) {
            // three quick taps on the same tree: a bird flies out of it, in a random direction (5 s between birds)
            const now = performance.now();
            const t = taps.current;
            t.n = t.tree === tree && now - t.at < 700 ? t.n + 1 : 1;
            t.tree = tree;
            t.at = now;
            if (t.n >= 3 && now - eggAt.current >= EGG_COOLDOWN_MS) {
              eggAt.current = now;
              t.n = 0;
              const a = Math.random() * Math.PI * 2;
              const [tx, ty] = TREES[tree]!;
              eggBirds.current.push({
                x: tx - 2,
                y: ty - 4,
                vx: Math.cos(a) * 55,
                vy: Math.sin(a) * 55,
                born: now,
              });
              play('tick');
            }
            return;
          }
          // only a tap on the wheel itself spins it: the rest of the field does nothing (no accidental rolls)
          if (tappable && Math.hypot(x - WHEEL.cx, y - WHEEL.cy) <= WHEEL.r) onTap?.();
        }}
        className="pointer-events-auto block h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      <img
        src={url(`hub-${hubColour}`)}
        alt=""
        data-testid="bk-hall"
        draggable={false}
        className="pointer-events-none absolute"
        style={{
          left: pct(HUB.x),
          top: pct(HUB.y),
          width: pct(HUB.size),
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

/** Which slice of `slices` a normal roll of `value` stops on: any slice with that number. */
export const sliceFor = (slices: readonly string[], value: number): number => {
  const at = slices.flatMap((s, i) => (s === String(value) ? [i] : []));
  return at[Math.floor(Math.random() * at.length)] ?? 0;
};
export const WHEEL_SLICES = bankrupt.WHEEL_SLICES;
export const SPECIAL_SLICES = bankrupt.SPECIAL_SLICES;
