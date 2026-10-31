import { useEffect, useRef, useState } from 'react';
import type { bankrupt } from '@pogo/shared';
import { play } from '../../lib/sound';
import { art } from './art';

type State = bankrupt.BankruptState;
interface Transfer {
  /** null = the bank. */
  from: string | null;
  to: string | null;
  tile: string;
  amount: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The payments in what the last move did, in order. */
function transfersOf(s: State): Transfer[] {
  const out: Transfer[] = [];
  const start = s.board.tiles[0]!.id;
  for (const e of s.events) {
    if (e.k === 'rent') out.push({ from: e.by, to: e.to, tile: e.tile, amount: e.amount });
    else if (e.k === 'salary') out.push({ from: null, to: e.by, tile: start, amount: e.amount });
    else if (e.k === 'buy') out.push({ from: e.by, to: null, tile: e.tile, amount: e.price });
    else if (e.k === 'auction' && e.winner)
      out.push({ from: e.winner, to: null, tile: e.tile, amount: e.amount });
    else if (e.k === 'trade') {
      // The bank pays both players a bonus.
      out.push({ from: null, to: e.by, tile: e.give, amount: e.bonus });
      out.push({ from: null, to: e.with, tile: e.take, amount: e.bonus });
    }
  }
  return out.filter((t) => t.amount > 0);
}

const centre = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
};
const tileEl = (id: string) => document.querySelector(`[data-testid="bk-tile-${id}"]`);
const tagEl = (id: string) => document.querySelector(`[data-testid="bk-player-${id}"]`);

/** A number pops up on the space (like the damage in Pet Match): it grows, tips over and drops away. */
async function pop(at: { x: number; y: number }, text: string, colour: string) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    left: `${at.x}px`,
    top: `${at.y}px`,
    zIndex: '60',
    pointerEvents: 'none',
    fontWeight: '800',
    fontSize: '30px',
    color: colour,
    textShadow: '0 3px 0 #101628, 2px 0 0 #101628, -2px 0 0 #101628, 0 -2px 0 #101628',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(el);
  const anim = el.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 0 },
      { transform: 'translate(-50%,-80%) scale(1.35) rotate(-6deg)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%,-90%) scale(1.2) rotate(5deg)', opacity: 1, offset: 0.65 },
      { transform: 'translate(-50%,-30%) scale(0.9) rotate(12deg)', opacity: 0 },
    ],
    { duration: 950, easing: 'ease-out' },
  );
  await anim.finished.catch(() => undefined);
  el.remove();
}

/** Banknotes fly from one point to another in an arc; resolves when the first one has arrived. */
function fly(from: { x: number; y: number }, to: { x: number; y: number }, amount: number) {
  const n = Math.max(2, Math.min(6, Math.ceil(amount / 40)));
  const ms = 700;
  const done: Promise<unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const img = document.createElement('img');
    img.src = art('cash');
    Object.assign(img.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '34px',
      zIndex: '60',
      pointerEvents: 'none',
      imageRendering: 'pixelated',
      opacity: '0',
    });
    document.body.appendChild(img);
    const wobble = (i - (n - 1) / 2) * 14;
    const midX = (from.x + to.x) / 2 + wobble;
    const midY = Math.min(from.y, to.y) - 60 - Math.abs(wobble);
    const a = img.animate(
      [
        {
          transform: `translate(${from.x - 17}px, ${from.y - 10}px) scale(0.6) rotate(0deg)`,
          opacity: 1,
        },
        {
          transform: `translate(${midX - 17}px, ${midY}px) scale(1.2) rotate(${wobble}deg)`,
          opacity: 1,
          offset: 0.5,
        },
        {
          transform: `translate(${to.x - 17}px, ${to.y - 10}px) scale(0.7) rotate(${-wobble}deg)`,
          opacity: 1,
          offset: 0.92,
        },
        { transform: `translate(${to.x - 17}px, ${to.y - 10}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: ms, delay: i * 90, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'both' },
    );
    done.push(a.finished.catch(() => undefined).then(() => img.remove()));
  }
  // The first note arriving is the moment the receiver's number starts to count.
  return { firstArrives: ms * 0.9, all: Promise.all(done) };
}

/**
 * The cash each player shows. Payments are played one after another once the token has stopped walking:
 * the amount pops on the space, the payer's number counts down, banknotes fly to the receiver and the
 * receiver's number counts up (like the damage numbers in Pet Match). Everything else just updates.
 */
export function useCashFx(state: State, ready: boolean): Record<string, number> {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p.cash])),
  );
  const values = useRef(shown);
  values.current = shown;
  const seenSeq = useRef(state.seq);
  const job = useRef<Transfer[] | null>(null);
  const stop = useRef<() => void>();
  const latest = useRef(state);
  latest.current = state;

  const snap = () =>
    setShown(Object.fromEntries(latest.current.players.map((p) => [p.id, p.cash])));

  useEffect(() => {
    if (seenSeq.current === state.seq) return;
    seenSeq.current = state.seq;
    stop.current?.();
    const transfers = reduced() ? [] : transfersOf(state);
    job.current = transfers.length > 0 ? transfers : null;
    const involved = new Set(transfers.flatMap((t) => [t.from, t.to]).filter(Boolean) as string[]);
    // Everybody not in a payment shows the new cash at once; the others wait for the show.
    setShown((cur) =>
      Object.fromEntries(
        state.players.map((p) => [p.id, involved.has(p.id) ? (cur[p.id] ?? p.cash) : p.cash]),
      ),
    );
  }, [state]);

  useEffect(() => {
    if (!ready || !job.current) return;
    const transfers = job.current;
    job.current = null;
    let stopped = false;
    stop.current = () => {
      stopped = true;
      snap();
    };
    const count = (id: string, delta: number, ms: number) =>
      new Promise<void>((resolve) => {
        const from = values.current[id] ?? 0;
        const t0 = performance.now();
        const step = (now: number) => {
          if (stopped) return resolve();
          const k = Math.min(1, (now - t0) / ms);
          setShown((cur) => ({ ...cur, [id]: Math.round(from + delta * k) }));
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    void (async () => {
      for (const t of transfers) {
        if (stopped) return;
        const tile = centre(tileEl(t.tile));
        const payer = t.from ? centre(tagEl(t.from)) : tile;
        const receiver = t.to ? centre(tagEl(t.to)) : tile;
        if (!tile || !payer || !receiver) continue;
        const text = `${t.from ? '-' : '+'}$${t.amount.toLocaleString('en-US')}`;
        void pop(tile, text, t.from ? '#ff6b57' : '#7ee08c');
        if (t.from) void count(t.from, -t.amount, 650);
        await sleep(420);
        if (stopped) return;
        const flight = fly(t.from ? payer : tile, t.to ? receiver : tile, t.amount);
        await sleep(flight.firstArrives);
        if (stopped) return;
        if (t.to) {
          play('score');
          await count(t.to, t.amount, 550);
        }
        await flight.all;
      }
      if (!stopped) snap();
    })();
    return () => {
      // (a new move cancels through `stop`, called when its state arrives)
    };
  }, [ready, state]);

  useEffect(() => () => stop.current?.(), []);
  return shown;
}
