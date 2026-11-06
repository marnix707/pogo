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
  /** Start salary that is paid on at once (you passed Start, then landed on a rent / fee): this part of the
   * notes flies on to `split.to` (null = the bank), the rest to `to`. */
  split?: { to: string | null; amount: number };
  /** The number that pops up instead of the amount. */
  label?: string;
  /** A building bought or sold: a short show that never holds the game up. */
  quick?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The payments in what the last move did, in order. */
function transfersOf(s: State): Transfer[] {
  const out: Transfer[] = [];
  const start = s.board.tiles[0]!.id;
  const ev = s.events;
  // You passed Start and then landed on a rent / fee: the salary notes divide between the one you pay and
  // your own cash, so the payment is not played on its own (only what the salary does not cover is).
  const split = new Map<number, { to: string | null; amount: number }>();
  const left = new Map<number, number>();
  ev.forEach((e, i) => {
    if (e.k !== 'salary' || e.amount <= 0) return;
    for (let j = i + 1; j < ev.length; j++) {
      const f = ev[j]!;
      if (left.has(j)) continue;
      if (f.k !== 'rent' && f.k !== 'pay') continue;
      const by = f.k === 'rent' ? f.by : f.from;
      if (by !== e.by || f.amount <= 0) continue;
      const x = Math.min(e.amount, f.amount);
      split.set(i, { to: f.to, amount: x });
      left.set(j, f.amount - x);
      break;
    }
  });
  ev.forEach((e, i) => {
    const sp = split.get(i);
    const rest = left.get(i);
    if (e.k === 'rent') out.push({ from: e.by, to: e.to, tile: e.tile, amount: rest ?? e.amount });
    else if (e.k === 'salary')
      out.push({
        from: null,
        to: e.by,
        tile: start,
        amount: e.amount,
        ...(sp ? { split: sp } : {}),
      });
    else if (e.k === 'build')
      out.push(
        e.amount > 0
          ? { from: e.by, to: null, tile: e.tile, amount: e.amount, quick: true }
          : { from: null, to: e.by, tile: e.tile, amount: -e.amount, quick: true },
      );
    else if (e.k === 'sold')
      out.push({ from: null, to: e.by, tile: e.tile, amount: e.amount, quick: true });
    else if (e.k === 'free' && e.fee)
      out.push({
        from: e.by,
        to: null,
        tile: s.board.tiles.find((t) => t.kind === 'jail')!.id,
        amount: e.fee,
      });
    else if (e.k === 'bail')
      for (const p of e.payers)
        out.push({
          from: p,
          to: null,
          tile: s.board.tiles.find((t) => t.kind === 'jail')!.id,
          amount: e.amount,
        });
    else if (e.k === 'buy') out.push({ from: e.by, to: null, tile: e.tile, amount: e.price });
    else if (e.k === 'auction' && e.winner)
      out.push({ from: e.winner, to: null, tile: e.tile, amount: e.amount });
    else if (e.k === 'pay')
      out.push({ from: e.from, to: e.to, tile: s.board.cardTile, amount: rest ?? e.amount });
    else if (e.k === 'rainbow') {
      // The street is sold: the bank pays each owner for their space.
      for (const p of e.payouts)
        out.push({ from: null, to: p.player, tile: p.tile, amount: p.amount });
    } else if (e.k === 'trade') {
      // The bank pays both players a bonus.
      // (both at once: the notes divide between the two, like a salary that is paid on)
      out.push({
        from: null,
        to: e.by,
        tile: e.give,
        amount: e.bonus * 2,
        split: { to: e.with, amount: e.bonus },
        label: '+$' + e.bonus.toLocaleString('en-US'),
      });
    }
  });
  return out.filter((t) => t.amount > 0);
}

const centre = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
};
const tileEl = (id: string) => document.querySelector(`[data-testid="bk-tile-${id}"]`);
const hallEl = () => document.querySelector('[data-testid="bk-hall"]');
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
function fly(from: { x: number; y: number }, targets: { x: number; y: number }[]) {
  const n = targets.length;
  const ms = 700;
  const done: Promise<unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const to = targets[i]!;
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
export function useCashFx(
  state: State,
  ready: boolean,
): { shown: Record<string, number>; playing: boolean } {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p.cash])),
  );
  // True from the move that brings a payment until its show is over: nobody acts before it.
  const [playing, setPlaying] = useState(false);
  const values = useRef(shown);
  values.current = shown;
  const seenSeq = useRef(state.seq);
  const job = useRef<Transfer[] | null>(null);
  const stop = useRef<() => void>();
  const latest = useRef(state);
  latest.current = state;
  // The cash of every player in the state before this move: where a payment's count starts from.
  const prevCash = useRef<Record<string, number>>(values.current);

  const snap = () => {
    setShown(Object.fromEntries(latest.current.players.map((p) => [p.id, p.cash])));
    setPlaying(false);
  };

  useEffect(() => {
    if (seenSeq.current === state.seq) return;
    seenSeq.current = state.seq;
    const before = prevCash.current;
    prevCash.current = Object.fromEntries(state.players.map((p) => [p.id, p.cash]));
    stop.current?.();
    const all = transfersOf(state);
    // (reduced motion: no show, but the money still makes its sound)
    if (reduced() && all.length > 0) play('cash');
    const transfers = reduced() ? [] : all;
    job.current = transfers.length > 0 ? transfers : null;
    setPlaying(transfers.some((t) => !t.quick));
    const involved = new Set(
      transfers.flatMap((t) => [t.from, t.to, t.split?.to]).filter(Boolean) as string[],
    );
    // Everybody not in a payment shows the new cash at once; the others wait for the show.
    // (from the cash before this move, not from what is on screen: a show that was cut short by
    // this move has just snapped to the new cash, which would count from the wrong number)
    setShown(
      Object.fromEntries(
        state.players.map((p) => [p.id, involved.has(p.id) ? (before[p.id] ?? p.cash) : p.cash]),
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
        // The bank is the town hall in the middle of the board: money to or from the bank goes there.
        const bank = centre(hallEl()) ?? tile;
        const payer = t.from ? centre(tagEl(t.from)) : bank;
        const receiver = t.to ? centre(tagEl(t.to)) : bank;
        const splitTo = t.split ? (t.split.to ? centre(tagEl(t.split.to)) : bank) : null;
        const viaBank = t.from === null || t.to === null;
        const bump = () =>
          hallEl()?.animate([{ scale: '1' }, { scale: '1.2' }, { scale: '1' }], {
            duration: 650,
            easing: 'ease-in-out',
          });
        if (!tile || !payer || !receiver || (t.split && !splitTo)) continue;
        const text = t.label ?? `${t.from ? '-' : '+'}$${t.amount.toLocaleString('en-US')}`;
        play('cash'); // every payment, whoever pays whom
        void pop(viaBank && bank ? bank : tile, text, t.from ? '#ff6b57' : '#7ee08c');
        if (t.from) void count(t.from, -t.amount, t.quick ? 450 : 650);
        await sleep(t.quick ? 120 : 420);
        if (stopped) return;
        // With a split, a share of the notes (the size of the payment) flies on to the one paid, spread
        // between the others so they all leave the space together.
        const n = t.split
          ? Math.max(4, Math.min(8, Math.ceil(t.amount / 30)))
          : Math.max(2, Math.min(6, Math.ceil(t.amount / 40)));
        const targets = Array.from({ length: n }, () => receiver);
        const mine = t.split
          ? Math.min(n - 1, Math.max(1, Math.round((n * t.split.amount) / t.amount)))
          : 0;
        for (let k = 0; k < mine; k++) targets[Math.floor(((k + 0.5) * n) / mine)] = splitTo!;
        // (the town hall swells a little when money leaves it, or when the first notes arrive in it)
        if (t.from === null) bump();
        const flight = fly(payer, targets);
        await sleep(flight.firstArrives);
        if (stopped) return;
        if (t.to === null) bump();
        if (t.to || t.split) {
          play('score');
          const own = t.amount - (t.split?.amount ?? 0);
          await Promise.all([
            t.to && own > 0 ? count(t.to, own, 550) : undefined,
            t.split?.to ? count(t.split.to, t.split.amount, 550) : undefined,
          ]);
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
  return { shown, playing };
}
