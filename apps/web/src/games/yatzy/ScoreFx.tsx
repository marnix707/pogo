import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { yatzy } from '@pogo/shared';
import { play, tick } from '../../lib/sound';
import { DIE_URL } from './Die';

type Category = yatzy.Category;

/** What the scorecard needs to know while the dice are being counted into a box. */
export interface ScoreFxView {
  playerId: string;
  category: Category;
  /** The new box (and what it adds to the totals) is not shown yet. */
  holdCell: boolean;
  /** The extra-Yatzy bonuses the player had before this score (the totals are held back with the box). */
  bonusesBefore: number;
  /** While the total counts up to its new value; null otherwise. */
  totalShown: number | null;
  /** Changes to restart the bold pulse of the total. */
  pulseKey: number;
}

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Timeline (ms).
const FLY_MS = 280;
const FLY_GAP_MS = 110;
const HOLD_MS = 260;
const TIP_MS = 220;
const FALL_MS = 300;
const COUNT_MS = 560;
const LINGER_MS = 700;

interface Point {
  x: number;
  y: number;
}
interface Flight {
  key: string;
  face: number;
  from: DOMRect | null;
  to: Point;
  delay: number;
  onArrive: () => void;
}
interface Num {
  at: Point;
  text: string;
  size: number;
  pop: number;
  tone: 'white' | 'grey';
  /** Set once the number tips over and falls towards the total. */
  fall: { dx: number; dy: number } | null;
  /** The number has landed on the total and is soaked up by it (shrinks away while the total counts). */
  absorb?: boolean;
}

const center = (r: DOMRect | null | undefined): Point | null =>
  r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
const rectOf = (testId: string) =>
  document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect() ?? null;
const shuffle = <T,>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
/** 1 die = the smallest number, 5 dice = the largest (a little bigger than the box). */
const sizeFor = (count: number) => 11 + (11 * (Math.min(count, 5) - 1)) / 4;

/**
 * Balatro-style scoring: the dice that count fly to the box in random order, the points pile up as a white
 * number that grows with every die, then it tips over and falls into the total, which counts up and pulses.
 * Detects a newly filled box by comparing the state with the previous one (so it works for every player).
 */
export function useScoreFx(state: yatzy.YatzyState): {
  view: ScoreFxView | null;
  overlay: ReactNode;
} {
  const prev = useRef(state);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef(0);
  const [view, setView] = useState<ScoreFxView | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [num, setNum] = useState<Num | null>(null);

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(raf.current);
    setFlights([]);
    setNum(null);
    setView(null);
  };
  useEffect(() => stop, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before === state || reduced()) return;
    for (const p of state.players) {
      const old = before.players.find((q) => q.id === p.id);
      if (!old) continue;
      const category = yatzy.CATEGORIES.find(
        (c) => p.scorecard[c] !== undefined && old.scorecard[c] === undefined,
      );
      if (!category || before.dice.length !== yatzy.DICE_COUNT) continue;
      begin(p, old, category, before.dice, p.scorecard[category]!);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function at(ms: number, fn: () => void) {
    timers.current.push(setTimeout(fn, ms));
  }

  function begin(
    p: yatzy.YatzyState['players'][number],
    old: yatzy.YatzyState['players'][number],
    category: Category,
    dice: number[],
    score: number,
  ) {
    stop();
    const cell = center(rectOf(`cell-${p.id}-${category}`));
    const totalRect = rectOf(`total-${p.id}`);
    const total = center(totalRect);
    if (!cell || !total) return;
    const base: ScoreFxView = {
      playerId: p.id,
      category,
      holdCell: true,
      bonusesBefore: old.yatzyBonuses,
      totalShown: null,
      pulseKey: 0,
    };
    setView(base);

    const idx = yatzy.scoringDiceIndices(dice, category, score);
    const from = yatzy.getTotals(old.scorecard, old.yatzyBonuses).grandTotal;
    const to = yatzy.getTotals(p.scorecard, p.yatzyBonuses).grandTotal;

    // Nothing counted (a zero): the 0 just drops into the box.
    if (idx.length === 0) {
      setNum({ at: cell, text: '0', size: 13, pop: 1, tone: 'grey', fall: null });
      at(450, () => {
        setNum(null);
        setView(null);
      });
      return;
    }

    const order = shuffle(idx);
    const faces = idx.map((i) => dice[i]!);
    const sum = faces.reduce((a, b) => a + b, 0);
    // The running totals: +3 +6 +9... (a box with a fixed score, like a straight, is spread evenly).
    const running = idx.map((_, k) =>
      sum === score
        ? faces.slice(0, k + 1).reduce((a, b) => a + b, 0)
        : Math.round((score * (k + 1)) / idx.length),
    );
    let count = 0;
    const n = order.length;
    setFlights(
      order.map((i, k) => ({
        key: `${Date.now()}-${k}`,
        face: dice[i]!,
        from: rectOf(`die-${i}`),
        to: cell,
        delay: k * FLY_GAP_MS,
        onArrive: () => {
          count += 1;
          play('tap');
          setNum({
            at: cell,
            text: `+${running[count - 1]}`,
            size: sizeFor(count),
            pop: count,
            tone: 'white',
            fall: null,
          });
        },
      })),
    );

    // All dice counted: the box shows its score, the number tips over and falls into the total.
    const countedAt = (n - 1) * FLY_GAP_MS + FLY_MS;
    at(countedAt + HOLD_MS, () => {
      setView((v) => (v ? { ...v, holdCell: false } : v));
      setNum((cur) =>
        cur ? { ...cur, fall: { dx: total.x - cell.x, dy: total.y - cell.y } } : cur,
      );
    });
    // Landed in the total: a second number there, the total counts up and pulses bold.
    const landedAt = countedAt + HOLD_MS + TIP_MS + FALL_MS;
    at(landedAt, () => {
      // The number lands: the total turns white, soaks the number up and races up to its new value
      // (casino style: quick ticks that rise in pitch).
      setNum({
        at: total,
        text: `+${score}`,
        size: 15,
        pop: 100,
        tone: 'white',
        fall: null,
        absorb: true,
      });
      const t0 = performance.now();
      let lastShown = from;
      let lastTick = 0;
      let ticks = 0;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / COUNT_MS);
        const eased = 1 - Math.pow(1 - k, 2.2);
        const shown = from + (to - from) * eased;
        if (Math.round(shown) !== Math.round(lastShown) && now - lastTick > 38) {
          tick(ticks++);
          lastTick = now;
        }
        lastShown = shown;
        setView((v) => (v ? { ...v, holdCell: false, totalShown: shown, pulseKey: 1 } : v));
        if (k < 1) raf.current = requestAnimationFrame(step);
        else play('score');
      };
      raf.current = requestAnimationFrame(step);
    });
    at(landedAt + LINGER_MS, () => {
      setNum(null);
      setView(null);
    });
  }

  const overlay = (
    <>
      {flights.map((f) => (
        <FlyingDie key={f.key} flight={f} />
      ))}
      {num && <ScoreNumber num={num} />}
    </>
  );
  return { view, overlay };
}

/** A miniature die flying from the dock to the box. */
function FlyingDie({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLSpanElement>(null);
  const size = 26;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = center(flight.from) ?? { x: window.innerWidth / 2, y: window.innerHeight };
    const scale = flight.from ? flight.from.width / size : 1.6;
    const anim = el.animate(
      [
        {
          transform: `translate(${start.x - flight.to.x}px, ${start.y - flight.to.y}px) scale(${scale}) rotate(0deg)`,
          opacity: 1,
        },
        { transform: 'translate(0, 0) scale(1) rotate(200deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(0, 0) scale(0.7) rotate(220deg)', opacity: 0 },
      ],
      {
        duration: FLY_MS + 60,
        delay: flight.delay,
        easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)',
        fill: 'both',
      },
    );
    const arrive = setTimeout(flight.onArrive, flight.delay + FLY_MS);
    return () => {
      clearTimeout(arrive);
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-50"
      style={{
        left: flight.to.x - size / 2,
        top: flight.to.y - size / 2,
        width: size,
        height: size,
        opacity: 0,
      }}
    >
      <img
        src={DIE_URL(flight.face)}
        alt=""
        draggable={false}
        className="h-full w-full"
        style={{
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 2px 0 #101628)',
          maxWidth: 'none',
        }}
      />
    </span>
  );
}

/** The white number with its own drop shadow; it pops with every die and finally tips over and falls. */
function ScoreNumber({ num }: { num: Num }) {
  const fallRef = useRef<HTMLDivElement>(null);
  const fell = !!num.fall;
  // Landed on the total: the number is soaked up (it shrinks into the total and fades).
  useLayoutEffect(() => {
    const el = fallRef.current;
    if (!el || !num.absorb) return;
    const anim = el.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.25)', opacity: 0 },
      ],
      { duration: 420, delay: 120, easing: 'ease-in', fill: 'forwards' },
    );
    return () => anim.cancel();
  }, [num.absorb]);
  useLayoutEffect(() => {
    const el = fallRef.current;
    if (!el || !num.fall) return;
    const { dx, dy } = num.fall;
    // Smooth click: it tips 45 degrees to the left, then falls down into the total and ends upright (0 degrees).
    const anim = el.animate(
      [
        {
          transform: 'translate(0, 0) rotate(0deg)',
          offset: 0,
          easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
        },
        {
          transform: 'translate(0, -3px) rotate(-45deg)',
          offset: TIP_MS / (TIP_MS + FALL_MS),
          easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)',
        },
        { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0.9)`, offset: 1 },
      ],
      { duration: TIP_MS + FALL_MS, fill: 'forwards' },
    );
    return () => anim.cancel();
  }, [fell]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      aria-hidden
      data-testid="score-fx-number"
      className="pointer-events-none fixed z-50"
      style={{ left: num.at.x, top: num.at.y, width: 0, height: 0 }}
    >
      <div ref={fallRef}>
        <span
          key={num.pop}
          className="score-pop absolute whitespace-nowrap font-bold leading-none"
          style={{
            fontSize: num.size,
            color: num.tone === 'white' ? '#ffffff' : '#bfc7d5',
            // The pixel font has one weight: a same-coloured shadow thickens it; the dark ones are the drop shadow.
            textShadow:
              '0.04em 0 0 currentColor, -0.04em 0 0 currentColor, 0 0.05em 0 #101628, 0.08em 0.1em 0 #101628, -0.04em 0.1em 0 #101628, 0 0.16em 0.12em rgb(0 0 0 / 0.45)',
          }}
        >
          {num.text}
        </span>
      </div>
    </div>
  );
}
