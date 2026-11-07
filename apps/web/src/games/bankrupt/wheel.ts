/**
 * The pixel spin wheel (from the artist's `wheel.js`): redrawn pixel by pixel at its current angle into a small
 * canvas every frame, so it stays crisp. `spinToIndex` lands on a slice the SERVER chose (the roll is decided by the
 * game, the wheel only shows it).
 */
const FONT: Record<string, string[]> = {
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
  '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  $: ['.X.', 'XXX', 'X..', 'XXX', '..X', 'XXX', '.X.'],
  X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
  J: ['..X', '..X', '..X', 'X.X', 'XXX'],
  A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'],
  I: ['X', 'X', 'X', 'X', 'X'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  ' ': ['.', '.', '.', '.', '.'],
};
const COLOURS: Record<string, [string, string, string]> = {
  '1': ['#ffffff', '#f7f1e4', '#dcdcdc'],
  '2': ['#fdcf51', '#fda200', '#ea9600'],
  '3': ['#83e9f8', '#3aaef7', '#0061b8'],
  '4': ['#ff9690', '#fd5f55', '#c14139'],
  '5': ['#74cca8', '#56a786', '#459373'],
  '6': ['#ae65ff', '#935adc', '#7d51ae'],
  $50: ['#fff4b4', '#fdcf51', '#c97a00'],
  X2: ['#fd7957', '#eb6b43', '#c14139'],
  JAIL: ['#a6a6a6', '#4f6367', '#334461'],
};
const INK = '#101628';

export interface Wheel {
  canvas: HTMLCanvasElement;
  R: number;
  slices: readonly string[];
  angle: number;
  spinning: boolean;
  onTick: (() => void) | null;
  /** Aim the wheel at slice `idx` (clockwise, `strength` 0-2 more turns / time) and ease onto it. */
  spinToIndex: (idx: number, now: number, durationMs: number, strength?: number) => void;
  update: (now: number) => void;
  render: (now: number) => HTMLCanvasElement;
  pointerFlicked: (now: number) => boolean;
  /** True during the white blink of the winning slice (the same beat the landing space blinks to). */
  flashOn: (now: number) => boolean;
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export function createWheel(radius: number, slices: readonly string[]): Wheel {
  const R = radius;
  const size = R * 2 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  let spin: { from: number; to: number; start: number; dur: number } | null = null;
  let flash: { idx: number; until: number } | null = null;
  let lastSlice: number | null = null;
  let flickUntil = 0;
  const glyphs = (s: string) => [...s].map((c) => FONT[c] ?? FONT[' ']!);
  const textW = (s: string) => glyphs(s).reduce((a, gl) => a + gl[0]!.length, 0) + s.length - 1;
  const stamp = (s: string, x0: number, y0: number, col: string) => {
    let x = x0;
    g.fillStyle = col;
    for (const gl of glyphs(s)) {
      const oy = Math.floor((gl.length - 5) / 2);
      gl.forEach((row, r) => {
        for (let i = 0; i < row.length; i++)
          if (row[i] === 'X') g.fillRect(x + i, y0 + r - oy, 1, 1);
      });
      x += gl[0]!.length + 1;
    }
  };
  const w: Wheel = {
    canvas,
    R,
    slices,
    angle: 0,
    spinning: false,
    onTick: null,
    pointerFlicked: (now) => now < flickUntil,
    flashOn: (now) => !!flash && now <= flash.until && Math.floor(now / 130) % 2 === 0,
    spinToIndex(idx, now, durationMs, strength = 1) {
      const n = w.slices.length;
      const seg = 360 / n;
      const offset = (Math.random() - 0.5) * seg * 0.7;
      const want = ((-(idx * seg + seg / 2 + offset) % 360) + 360) % 360;
      const cur = ((w.angle % 360) + 360) % 360;
      const turns = 3 + Math.round(strength * 2);
      const delta = ((((want - cur) % 360) + 360) % 360) + turns * 360;
      spin = { from: w.angle, to: w.angle + delta, start: now, dur: durationMs };
      flash = null;
      w.spinning = true;
      // (remember which slice it is aiming at, for the flash when it stops)
      flash = null;
      pendingIdx = idx;
    },
    update(now) {
      if (spin) {
        const u = Math.min(1, (now - spin.start) / spin.dur);
        w.angle = spin.from + (spin.to - spin.from) * (1 - Math.pow(1 - u, 4));
        if (u >= 1) {
          spin = null;
          w.spinning = false;
          flash = { idx: pendingIdx, until: now + 400 };
        }
      }
      if (flash && now > flash.until) flash = null;
      const seg = 360 / w.slices.length;
      const cur = Math.floor((((-w.angle % 360) + 360) % 360) / seg);
      if (lastSlice !== null && cur !== lastSlice) {
        flickUntil = now + 60;
        if (spin && w.onTick) w.onTick();
      }
      lastSlice = cur;
    },
    render(now) {
      const n = w.slices.length;
      const seg = 360 / n;
      const img = g.createImageData(size, size);
      const d = img.data;
      const winner = flash && Math.floor(now / 130) % 2 === 0 ? flash.idx : -1;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - (R + 0.5);
          const dy = y + 0.5 - (R + 0.5);
          const r = Math.hypot(dx, dy);
          if (r > R + 0.4) continue;
          let col: string;
          if (r > R - 1) col = INK;
          else if (r > R - 5)
            col = r > R - 2 ? '#c97a00' : '#fdcf51'; // gold rim
          else if (r < 9)
            col = r > 8 ? INK : '#f7f1e4'; // hub plate
          else {
            const phi = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
            const th = (((phi - w.angle) % 360) + 360) % 360;
            const i = Math.floor(th / seg);
            const off = th - i * seg;
            const edge = ((Math.min(off, seg - off) * Math.PI) / 180) * r;
            if (edge < 0.7 || r > R - 6) col = INK;
            else {
              const c = COLOURS[w.slices[i]!] ?? COLOURS['1']!;
              col = i === winner ? '#ffffff' : r > R - 12 ? c[0] : r < 14 ? c[2] : c[1];
            }
          }
          const [a, b, c2] = hex(col);
          const k = (y * size + x) * 4;
          d[k] = a;
          d[k + 1] = b;
          d[k + 2] = c2;
          d[k + 3] = 255;
        }
      g.putImageData(img, 0, 0);
      for (let i = 0; i < n; i++) {
        // upright labels
        const a = ((w.angle + (i + 0.5) * seg) * Math.PI) / 180;
        const s = w.slices[i]!;
        const rr = s.length > 2 ? 27 : 30;
        const x = Math.round(R + rr * Math.sin(a) - textW(s) / 2);
        const y = Math.round(R - rr * Math.cos(a) - 2);
        if (s === '1' || s === '$50') stamp(s, x, y, INK);
        else {
          for (const [ox, oy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
          ] as const)
            stamp(s, x + ox, y + oy, INK);
          stamp(s, x, y, '#ffffff');
        }
      }
      const phase = Math.floor(now / (spin ? 70 : 600)); // rim lights
      for (let i = 0; i < n; i++) {
        const a = ((w.angle + i * seg) * Math.PI) / 180;
        const x = Math.round(R + (R - 3) * Math.sin(a));
        const y = Math.round(R - (R - 3) * Math.cos(a));
        g.fillStyle = (i + phase) % 2 ? '#fff4b4' : '#ea9600';
        g.fillRect(x - 1, y - 1, 2, 2);
      }
      return canvas;
    },
  };
  let pendingIdx = 0;
  return w;
}
