/**
 * Topographic contour lines that slowly move and breathe: a smooth noise "height field" that drifts
 * and morphs over time, drawn as iso-lines (marching squares). Pure functions, no DOM: the canvas
 * component (components/TopoBackground.tsx) draws them, and topo.test.ts checks them.
 */

/** Improved Perlin noise in 3 dimensions (x, y and time), seeded; returns values in about [-1, 1]. */
export function makeNoise(seed = 7): (x: number, y: number, z: number) => number {
  const p = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; // a tiny deterministic generator
    const j = s % (i + 1);
    [base[i], base[j]] = [base[j] as number, base[i] as number];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255] as number;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  const grad = (h: number, x: number, y: number, z: number) => {
    const u = (h & 15) < 8 ? x : y;
    const v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  return (x, y, z) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X]! + Y;
    const AA = p[A]! + Z;
    const AB = p[A + 1]! + Z;
    const B = p[X + 1]! + Y;
    const BA = p[B]! + Z;
    const BB = p[B + 1]! + Z;
    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(p[AA]!, x, y, z), grad(p[BA]!, x - 1, y, z)),
        lerp(u, grad(p[AB]!, x, y - 1, z), grad(p[BB]!, x - 1, y - 1, z)),
      ),
      lerp(
        v,
        lerp(u, grad(p[AA + 1]!, x, y, z - 1), grad(p[BA + 1]!, x - 1, y, z - 1)),
        lerp(u, grad(p[AB + 1]!, x, y - 1, z - 1), grad(p[BB + 1]!, x - 1, y - 1, z - 1)),
      ),
    );
  };
}

export type Noise = ReturnType<typeof makeNoise>;

/** The height (about 0.15..0.85) at a point; `t` in seconds. Organic blobs: warped, two octaves. */
export function heightAt(noise: Noise, x: number, y: number, t: number): number {
  const wx = x + 0.4 * noise(x * 0.9 + 11.3, y * 0.9, t * 0.05);
  const wy = y + 0.4 * noise(x * 0.9, y * 0.9 + 23.7, t * 0.05);
  const h =
    0.6 * noise(wx, wy, t * 0.045) +
    0.28 * noise(wx * 2.3 + 5.1, wy * 2.3, t * 0.06) +
    0.12 * noise(wx * 5.1 + 9.7, wy * 5.1 + 2.2, t * 0.08);
  return 0.5 + 0.5 * h;
}

/** Contour levels: fine lines, and every `majorEvery`-th one is an "index" line (drawn heavier). */
export function levels(count = 12, from = 0.14, to = 0.86) {
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

/**
 * Marching squares: calls `line` with the end points of every iso-line segment at `level` in a
 * (cols x rows) grid of samples `values` (row-major); (x, y) of sample (i, j) is (i * cell, j * cell).
 */
export function contour(
  values: ArrayLike<number>,
  cols: number,
  rows: number,
  cell: number,
  level: number,
  line: (x1: number, y1: number, x2: number, y2: number) => void,
) {
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = values[j * cols + i]!; // top left
      const b = values[j * cols + i + 1]!; // top right
      const c = values[(j + 1) * cols + i + 1]!; // bottom right
      const d = values[(j + 1) * cols + i]!; // bottom left
      const index =
        (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const x = i * cell;
      const y = j * cell;
      // Where the iso-line crosses each edge of the cell.
      const top = () => [x + (cell * (level - a)) / (b - a), y] as const;
      const right = () => [x + cell, y + (cell * (level - b)) / (c - b)] as const;
      const bottom = () => [x + (cell * (level - d)) / (c - d), y + cell] as const;
      const left = () => [x, y + (cell * (level - a)) / (d - a)] as const;
      const seg = (p: readonly [number, number], q: readonly [number, number]) =>
        line(p[0], p[1], q[0], q[1]);
      switch (index) {
        case 1:
        case 14:
          seg(left(), bottom());
          break;
        case 2:
        case 13:
          seg(bottom(), right());
          break;
        case 3:
        case 12:
          seg(left(), right());
          break;
        case 4:
        case 11:
          seg(top(), right());
          break;
        case 6:
        case 9:
          seg(top(), bottom());
          break;
        case 7:
        case 8:
          seg(top(), left());
          break;
        case 5:
        case 10: {
          // A saddle: the centre decides which two corners are joined.
          const centre = (a + b + c + d) / 4 > level;
          if ((index === 5) === centre) {
            seg(top(), left());
            seg(bottom(), right());
          } else {
            seg(top(), right());
            seg(left(), bottom());
          }
          break;
        }
      }
    }
  }
}

/** How the background is laid out; shared by the canvas and by tests/previews. */
export const TOPO = {
  /** Sample spacing in CSS px (smaller = smoother lines, more work). */
  cell: 9,
  levelCount: 22,
  /** Every n-th contour is an index line. */
  majorEvery: 5,
  /** Seconds for one slow in-and-out of the lines. */
  breathSeconds: 16,
  /** How far (in height units) the lines move in and out while breathing. */
  breathDepth: 0.035,
  /** Pan speed in noise units per second. */
  drift: 0.006,
};

/** One frame of the background at time `t` (seconds) for a (w x h) screen. */
export function topoFrame(
  noise: Noise,
  w: number,
  h: number,
  t: number,
  minor: (x1: number, y1: number, x2: number, y2: number) => void,
  major: (x1: number, y1: number, x2: number, y2: number) => void,
) {
  const { cell } = TOPO;
  const cols = Math.ceil(w / cell) + 2;
  const rows = Math.ceil(h / cell) + 2;
  const unit = Math.max(240, w * 0.45); // pixels per noise unit: how big the blobs are
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      values[j * cols + i] = heightAt(
        noise,
        (i * cell) / unit + t * TOPO.drift,
        (j * cell) / unit,
        t,
      );
    }
  }
  const breath = TOPO.breathDepth * Math.sin((t / TOPO.breathSeconds) * Math.PI * 2);
  levels(TOPO.levelCount).forEach((level, k) => {
    contour(values, cols, rows, cell, level + breath, k % TOPO.majorEvery === 0 ? major : minor);
  });
}
