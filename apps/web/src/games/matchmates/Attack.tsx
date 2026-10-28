import { useEffect, useState } from 'react';
import { SCREEN, attackUrl, digitUrl } from './art';

const px = { imageRendering: 'pixelated' } as const;

/** The attack timeline in ms (the shape of `attack-demo-template.html`, one orbit instead of two). */
export const ATTACK = {
  /** A pause before the spirit leaves, so what filled the bar is seen first. */
  lead: 350,
  flyEnd: 400,
  circleEnd: 1100,
  shootEnd: 1400,
  /** The hit: shake, flash and the damage number start here. */
  hit: 1400,
  total: 2000,
} as const;

export interface AttackFx {
  id: number;
  element: string;
  /** Screen art px: where the spirit starts (the pet), the middle and size of the matched group, the target pet. */
  from: [number, number];
  group: { cx: number; cy: number; rx: number; ry: number };
  to: [number, number];
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const IMPACT_MS = [40, 50, 60, 60, 70, 80];

/** The spirit's spot at time t (null = not flying): a bezier arc in, an ellipse round the match, then a shot. */
function spirit(fx: AttackFx, t: number): { x: number; y: number; big: boolean } | null {
  const { cx, cy, rx, ry } = fx.group;
  if (t < 0 || t >= ATTACK.shootEnd) return null;
  if (t < ATTACK.flyEnd) {
    const u = ease(t / ATTACK.flyEnd);
    const [fx0, fy0] = fx.from;
    const ex = cx - rx;
    const ey = cy;
    const qx = (fx0 + ex) / 2;
    const qy = Math.min(fy0, ey) - 40;
    return {
      x: (1 - u) * (1 - u) * fx0 + 2 * (1 - u) * u * qx + u * u * ex,
      y: (1 - u) * (1 - u) * fy0 + 2 * (1 - u) * u * qy + u * u * ey,
      big: false,
    };
  }
  if (t < ATTACK.circleEnd) {
    const a = Math.PI + (2 * Math.PI * (t - ATTACK.flyEnd)) / (ATTACK.circleEnd - ATTACK.flyEnd);
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), big: true };
  }
  const u = Math.pow((t - ATTACK.circleEnd) / (ATTACK.shootEnd - ATTACK.circleEnd), 2);
  return { x: cx + (fx.to[0] - cx) * u, y: cy + (fx.to[1] - cy) * u, big: true };
}

/** A sprite centred on a screen art-pixel spot, placed in % of the stage. */
function Sprite({ src, x, y, w, h }: { src: string; x: number; y: number; w: number; h: number }) {
  const left = Math.round(x) - Math.floor(w / 2);
  const top = Math.round(y) - Math.floor(h / 2) - SCREEN.top;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute"
      style={{
        ...px,
        left: `${(left / SCREEN.w) * 100}%`,
        top: `${(top / SCREEN.h) * 100}%`,
        width: `${(w / SCREEN.w) * 100}%`,
      }}
    />
  );
}

/**
 * One special attack, drawn over the battle screen like the reference: the element's spirit flies an arc to
 * the matched tiles, circles them (leaving a trail of its own past positions), shoots at the target pet and
 * bursts there. The shake / flash of the pet and the damage number are done by the screen at `ATTACK.hit`.
 */
export function Attack({ fx, onDone }: { fx: AttackFx; onDone: () => void }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= ATTACK.total) return onDone();
      setT(elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.id]);

  const trail = [];
  for (let n = 13; n >= 1; n--) {
    const age = n * 25;
    const p = spirit(fx, t - age);
    if (!p) continue;
    const size = age < 110 ? 3 : age < 220 ? 2 : 1;
    trail.push(
      <Sprite
        key={n}
        src={attackUrl(fx.element, `trail-${age < 110 ? 0 : age < 220 ? 1 : 2}`)}
        x={p.x}
        y={p.y}
        w={size}
        h={size}
      />,
    );
  }
  const p = spirit(fx, t);
  let impact = null;
  if (t >= ATTACK.hit && t < ATTACK.hit + 400) {
    let a = t - ATTACK.hit;
    let f = 0;
    while (f < 5 && a >= (IMPACT_MS[f] as number)) {
      a -= IMPACT_MS[f] as number;
      f++;
    }
    impact = (
      <Sprite src={attackUrl(fx.element, `impact-0${f}`)} x={fx.to[0]} y={fx.to[1]} w={30} h={30} />
    );
  }
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden
      data-testid="mates-attack"
    >
      {trail}
      {p && (
        <Sprite
          src={attackUrl(
            fx.element,
            `${p.big ? 'spirit-charged' : 'spirit'}-0${Math.floor(t / 70) % 4}`,
          )}
          x={p.x}
          y={p.y}
          w={p.big ? 21 : 15}
          h={p.big ? 21 : 15}
        />
      )}
      {impact}
    </div>
  );
}

/** A number in the artist's chunky digits: `-8` red for damage, `+5` green for healing. */
export function Digits({ text, tone }: { text: string; tone: 'dmg' | 'heal' }) {
  return (
    <span className="flex items-end" style={{ gap: '0.5cqw' }}>
      {[...text].map((ch, i) => (
        <img
          key={i}
          src={digitUrl(`${tone}-${ch === '-' ? 'minus' : ch === '+' ? 'plus' : ch}`)}
          alt=""
          draggable={false}
          style={{ ...px, height: `${((ch === '-' || ch === '+' ? 8 : 13) / SCREEN.w) * 100}cqw` }}
        />
      ))}
    </span>
  );
}
