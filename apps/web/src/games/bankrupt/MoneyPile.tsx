import { useEffect, useRef } from 'react';
import pile from '../../assets/sprites/bankrupt/money/pile.json';

/**
 * The pile of money at the bottom of the screen: my cash as bundles of bills that heap up like the cookies in a
 * cookie clicker. The pile is simulated once, offline (`bk_money.py` in the pixel-art skill: bundles dropped one by
 * one and rolled to rest, fixed seed), so the screen only draws the first N bundles of the list and the same bundles
 * always lie in the same place: more cash is more bundles on top. The height is linear in the cash: `fullCash` fills the
 * pile up to `fullHeight` (the top of the Spin button), $1,000 half way, more cash goes on behind the button and
 * over the board.
 */
const urls = import.meta.glob('../../assets/sprites/bankrupt/money/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

type Meta = {
  width: number;
  sprites: { name: string; w: number; h: number; high: number[] }[];
  bundles: [number, number, number][];
  heights: number[];
};
const meta = pile as unknown as Meta;

/** The cash that fills the pile up to the button. */
export const PILE_FULL_CASH = 2000;
const FALL_ART = 70; // art px a new bundle falls
const FALL_MS = 320;
const SOLID = '#2f6a52'; // under the bundles: no gaps in the heap

let images: HTMLImageElement[] | null = null;
/** Called whenever a picture has loaded: the pile on screen redraws itself (the newest draw, never a stale one). */
let onImage: () => void = () => undefined;
function loadImages(): HTMLImageElement[] {
  if (images) return images;
  images = meta.sprites.map((sp) => {
    const im = new Image();
    im.src = urls[`../../assets/sprites/bankrupt/money/bundle-${sp.name}.svg`] ?? '';
    im.onload = () => onImage();
    return im;
  });
  return images;
}

/** How many bundles make a pile `height` art px high (the first count whose pile reaches it). */
export function bundlesFor(height: number): number {
  if (height <= 0) return 0;
  const hs = meta.heights;
  let lo = 0;
  let hi = hs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hs[mid]! >= height) hi = mid;
    else lo = mid + 1;
  }
  return Math.min(lo + 1, hs.length);
}

export function MoneyPile({
  cash,
  s,
  fullHeight,
  maxHeight,
  reduceMotion,
}: {
  cash: number;
  /** css px per art px */
  s: number;
  /** art px from the bottom of the screen to the top of the Spin button: the pile height at PILE_FULL_CASH */
  fullHeight: number;
  /** art px: the pile never gets higher than this */
  maxHeight: number;
  reduceMotion?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = bundlesFor(Math.min(maxHeight, (Math.max(0, cash) / PILE_FULL_CASH) * fullHeight));
  // the animation state lives in refs: it runs outside React's renders
  const shown = useRef(target); // bundles on the heap (settled)
  const spawn = useRef<number[]>([]); // when each falling bundle started, by index
  const raf = useRef(0);
  const first = useRef(true);

  const W = meta.width;
  const hArt = Math.ceil(maxHeight);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const imgs = loadImages();
    onImage = () => draw(performance.now());

    function draw(now: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, cv!.width, cv!.height);
      ctx.imageSmoothingEnabled = false;
      const settled = Math.floor(shown.current);
      const falling = spawn.current;
      const top = new Array<number>(W).fill(0); // the heap's surface per column, art px up
      const put = (k: number, lift: number) => {
        const [si, x, y] = meta.bundles[k]!;
        const sp = meta.sprites[si]!;
        const im = imgs[si]!;
        if (im.complete && im.naturalWidth)
          ctx.drawImage(im, x * s, (hArt - y - sp.h - lift) * s, sp.w * s, sp.h * s);
      };
      // the solid body of the heap first (settled bundles only)
      for (let k = 0; k < settled; k++) {
        const [si, x, y] = meta.bundles[k]!;
        const sp = meta.sprites[si]!;
        for (let i = 0; i < sp.w; i++) {
          const cx = x + i;
          if (cx >= 0 && cx < W) top[cx] = Math.max(top[cx]!, y + sp.high[i]!);
        }
      }
      ctx.fillStyle = SOLID;
      for (let cx = 0; cx < W; cx++) {
        const t = top[cx]! - 3;
        if (t > 0) ctx.fillRect(cx * s, (hArt - t) * s, s, t * s);
      }
      for (let k = 0; k < settled; k++) put(k, 0);
      // the new bundles falling in, on top
      for (let k = settled; k < settled + falling.length && k < meta.bundles.length; k++) {
        const t0 = falling[k - settled];
        if (t0 === undefined || now < t0) continue;
        const p = Math.min(1, (now - t0) / FALL_MS);
        put(k, Math.round(FALL_ART * (1 - p * p)));
      }
    }

    function frame(now: number) {
      raf.current = 0;
      const goal = target;
      const fall = spawn.current;
      let busy = false;
      if (fall.length) {
        // bundles that landed join the heap, in order
        while (fall.length && now - fall[0]! >= FALL_MS) {
          fall.shift();
          shown.current += 1;
        }
        busy = fall.length > 0;
      }
      if (shown.current > goal) {
        // money was paid out: the top of the heap goes first
        shown.current = Math.max(goal, shown.current - Math.max(1, (shown.current - goal) / 10));
        busy = true;
      }
      draw(now);
      if (busy) raf.current = requestAnimationFrame(frame);
    }

    const now = performance.now();
    const settledNow = Math.floor(shown.current) + spawn.current.length;
    if (first.current || reduceMotion) {
      first.current = false;
      shown.current = target;
      spawn.current = [];
    } else if (target > settledNow) {
      // more money: new bundles drop in one after the other
      const add = target - settledNow;
      const gap = Math.min(45, 900 / add);
      for (let i = 0; i < add; i++) spawn.current.push(now + i * gap);
    } else if (target < settledNow) {
      // less: forget what was still falling, and let the heap shrink
      spawn.current = [];
      shown.current = Math.min(shown.current, settledNow);
    }
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf.current);
      onImage = () => undefined;
    };
  }, [target, s, hArt, W, reduceMotion]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      data-testid="bk-money-pile"
      data-bundles={target}
      className="pointer-events-none absolute bottom-0 left-0"
      style={{ width: W * s, height: hArt * s, imageRendering: 'pixelated' }}
      width={W * s}
      height={hArt * s}
    />
  );
}
