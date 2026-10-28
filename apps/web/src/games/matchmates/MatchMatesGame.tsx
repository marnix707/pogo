import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { matchmates } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, Button, TimerDrain } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { chainSound, play, tick } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import { useTimeWarning } from '../../lib/useTimeWarning';
import {
  SCREEN,
  boardPanelUrl,
  glowUrl,
  hudUrl,
  iceUrl,
  monsterSize,
  monsterUrl,
  portraitUrl,
  tileUrl,
} from './art';
import { ATTACK, Attack, Digits } from './Attack';
import type { AttackFx } from './Attack';
import { Coin } from './Coin';
import { Pick } from './Pick';
import { usePetInfo } from './PetInfo';

const {
  COLS,
  ROWS,
  CELLS,
  MONSTERS,
  STAGE_SPECS,
  evolveCost,
  BERRIES_TO_EVOLVE,
  STEP_MS,
  FIRE_MS,
  SWAP_MS,
  EVOLVE_MS,
  NOTE_MS,
} = matchmates;

const px = { imageRendering: 'pixelated' } as const;
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Anim {
  board: matchmates.MateCell[];
  flash: Set<number>;
  /** Rows each square fell to get where it is (0 = stayed), for the drop animation. */
  drops?: number[];
  /** Changes with every drop so the animation restarts. */
  key: number;
  /** The two squares that just swapped: they slide from each other's place. */
  swap?: [number, number];
  /** Squares whose tile flies away (to a mana bar or the berries) instead of popping. */
  flown?: Set<number>;
}
/** A miniature tile flying from the board to the bar it fills (like the Yatzy dice flying into the box). */
interface Flight {
  id: number;
  src: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
}
/** The running total that pops up where the tiles land: +1, +2, +3... */
interface Tally {
  key: string;
  x: number;
  y: number;
  n: number;
}
interface Note {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}
interface Spark {
  id: number;
  cell: number;
  emoji: string;
  dx: number;
}

/** Milliseconds the cleared tiles pop before the rest falls; the fall takes the remaining time of a step. */
const FLASH_MS = 230;

/** How far every square of the new board fell: survivors drop into the holes, new tiles come from above. */
function dropsFor(cleared: readonly number[]): number[] {
  const gone = new Set(cleared);
  const out = new Array<number>(CELLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    const survivors: number[] = [];
    let fresh = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (gone.has(r * COLS + c)) fresh += 1;
      else survivors.push(r);
    }
    for (let n = 0, r = ROWS - 1; r >= 0; r--, n++)
      out[r * COLS + c] = n < survivors.length ? r - (survivors[n] as number) : fresh;
  }
  return out;
}
interface Pop {
  id: number;
  /** Screen art pixels. */
  x: number;
  y: number;
  text: string;
  tone?: 'heal';
}
/** The artist's match glow bursting round the cleared tiles (frames 0-7). */
interface GlowState {
  items: { cell: number; kind: string }[];
  frame: number;
}
const ELEMENT_COLOR: Record<matchmates.Element, string> = {
  fire: '#eb6b43',
  water: '#3aaef7',
  earth: '#56a786',
  electric: '#fdcf51',
  psychic: '#935adc',
};
/** Flight time of a tile and the most the flights of one cascade step may spread over. */
const FLY_MS = 200;
const FLY_SPREAD_MS = 200;
/** How long a +n total stays over a bar before it moves away. */
const TALLY_MS = 3000;

const centerOf = (testId: string): { x: number; y: number } | null => {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export function MatchMatesGame({ room, me, sendMove, chrome }: GameUiProps) {
  const game = room.game!;
  const view = game.view as matchmates.MatesView;
  const finished = room.status === 'finished' || view.phase === 'over';
  const myTurn = view.phase === 'play' && !finished && view.turn === me;
  const memberOf = (id: string) => room.members.find((m) => m.id === id);
  const secondsLeft = useCountdown(game.deadline, room.serverTime);
  useTimeWarning(secondsLeft, myTurn || view.phase === 'pick');

  const mine = view.players.find((p) => p.id === me) ?? view.players[0]!;
  const theirs = view.players.find((p) => p.id !== mine.id)!;

  const petInfo = usePetInfo();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [combo, setCombo] = useState<{ id: number; level: number } | null>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [tallies, setTallies] = useState<Tally[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [evolve, setEvolve] = useState<{
    owner: string;
    slot: number;
    phase: 'charge' | 'pop';
  } | null>(null);
  // The coin flip after the draft (also when the game is opened right at its start).
  const [coin, setCoin] = useState(view.phase === 'play' && view.moveCount === 0);
  const lastPhase = useRef(view.phase);
  const [atk, setAtk] = useState<AttackFx | null>(null);
  const [hit, setHit] = useState<{ owner: string; slot: number } | null>(null);
  const [glow, setGlow] = useState<GlowState | null>(null);
  const seen = useRef(view.moveCount);
  // Hit points as the animation has got to: they change when the attack lands, not when the move arrives.
  const hpNow = Object.fromEntries(view.players.map((p) => [p.id, p.hp]));
  const prevHp = useRef<Record<string, number>>(hpNow);
  const [hpShown, setHpShown] = useState<Record<string, number> | null>(null);
  const hpMax = Object.fromEntries(view.players.map((p) => [p.id, p.maxHp]));
  // Before the first paint of a new move: keep showing the hit points from before it.
  useLayoutEffect(() => {
    if (view.moveCount > seen.current && view.lastEvent && !reducedMotion())
      setHpShown({ ...prevHp.current });
    prevHp.current = hpNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.moveCount]);

  const send = async (move: matchmates.MatesMove) => {
    setBusy(true);
    try {
      await sendMove(move);
    } finally {
      setBusy(false);
    }
  };

  // Replay the latest move: the swap, then every cascade (flash, fall) and every attack.
  useEffect(() => {
    if (view.moveCount <= seen.current) {
      seen.current = view.moveCount;
      return;
    }
    seen.current = view.moveCount;
    const ev = view.lastEvent;
    if (!ev || reducedMotion()) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    let t = 0;
    let board = ev.swapped ?? view.board;
    let key = 0;
    let sparkId = 0;
    let flightId = 0;
    let noteId = 0;
    const who = ev.by === me ? 'me' : 'opp';
    const mover = view.players.find((p) => p.id === ev.by);
    const say = (text: string, tone: Note['tone'], ms: number) =>
      at(ms, () => setNote({ id: ++noteId + ev.seq * 100, text, tone }));
    if (ev.swapped)
      setAnim({
        board,
        flash: new Set(),
        key,
        swap: ev.a !== undefined && ev.b !== undefined ? [ev.a, ev.b] : undefined,
      });
    t += SWAP_MS;
    if (ev.kind === 'evolve' && ev.slot !== undefined) {
      const slot = ev.slot;
      const evolvedNow = mover?.monsters[slot]?.element;
      // Charge up (glow, shake, rising notes), then the new form pops out in a flash.
      at(t, () => setEvolve({ owner: ev.by, slot, phase: 'charge' }));
      for (let n = 0; n < 5; n++) at(t + n * 200, () => chainSound(n));
      say(`${evolvedNow ? MONSTERS[evolvedNow].names[0] : 'Your pet'} is evolving...`, 'info', t);
      at(t + EVOLVE_MS * 0.55, () => {
        setEvolve({ owner: ev.by, slot, phase: 'pop' });
        play('win');
        haptic('success');
        if (evolvedNow)
          setNote({
            id: ++noteId + ev.seq * 100,
            text: `${MONSTERS[evolvedNow].names[1]}!`,
            tone: 'good',
          });
      });
      at(t + EVOLVE_MS, () => setEvolve(null));
      t += EVOLVE_MS;
    }
    let popId = 0;
    let atkId = 0;
    const petAt = (id: string, slot: number): [number, number] => {
      const spot =
        SCREEN.slots[id === me ? 'me' : 'opp'][slot] ?? SCREEN.slots[id === me ? 'me' : 'opp'][0];
      return [spot[0], spot[1]];
    };
    const fireAt = (k: number) => {
      for (const f of ev.fires.filter((x) => x.step === k)) {
        const target = f.owner === me ? theirs.id : me;
        // The spirit circles the tiles that were just matched (or the middle of the board).
        const cells = ev.steps[k - 1]?.cleared ?? [];
        const cols = cells.map((c) => c % COLS);
        const rows = cells.map((c) => Math.floor(c / COLS));
        const x0 = SCREEN.boardX + (cols.length ? Math.min(...cols) : 2) * SCREEN.cell;
        const x1 = SCREEN.boardX + ((cols.length ? Math.max(...cols) : 4) + 1) * SCREEN.cell;
        const y0 = SCREEN.boardY + (rows.length ? Math.min(...rows) : 2) * SCREEN.cell;
        const y1 = SCREEN.boardY + ((rows.length ? Math.max(...rows) : 2) + 1) * SCREEN.cell;
        const [fx, fy] = petAt(f.owner, f.slot);
        const [tx, ty] = petAt(target, f.slot);
        const fx$: AttackFx = {
          id: ++atkId + ev.seq * 100,
          element: f.element,
          from: [fx, fy - 12],
          group: {
            cx: (x0 + x1) / 2,
            cy: (y0 + y1) / 2,
            rx: (x1 - x0) / 2 + 7,
            ry: (y1 - y0) / 2 + 8,
          },
          to: [tx, ty - 14],
        };
        // A short pause first: the +n totals over the bars are seen before the attack starts.
        at(t + ATTACK.lead, () => {
          setAtk(fx$);
          setNote({
            id: ++noteId + ev.seq * 100,
            text: MONSTERS[f.element].effect[f.evolved ? 1 : 0],
            tone: 'info',
          });
        });
        // The hit: the target shakes and flashes, the number floats up.
        at(t + ATTACK.lead + ATTACK.hit, () => {
          play('boom');
          setHpShown((h) =>
            h
              ? {
                  ...h,
                  [target]: Math.max(0, (h[target] ?? 0) - f.damage),
                  [f.owner]: Math.min(hpMax[f.owner] ?? 0, (h[f.owner] ?? 0) + f.heal),
                }
              : h,
          );
          setHit({ owner: target, slot: f.slot });
          setPops((p) => [
            ...p,
            { id: ++popId + ev.seq * 100, x: tx, y: ty - 26, text: `-${f.damage}` },
            ...(f.heal > 0
              ? [
                  {
                    id: ++popId + ev.seq * 100,
                    x: fx,
                    y: fy - 30,
                    text: `+${f.heal}`,
                    tone: 'heal' as const,
                  },
                ]
              : []),
            // The drain takes mana from both of the opponent's pets: a number over each.
            ...(f.drain
              ? SCREEN.slots[target === me ? 'me' : 'opp'].map(([sx, sy], n) => ({
                  id: ++popId + ev.seq * 100 + n * 10,
                  x: sx,
                  y: sy + 8,
                  text: `-${f.drain} mana`,
                }))
              : []),
          ]);
        });
        at(t + ATTACK.lead + ATTACK.hit + 450, () => setHit(null));
        at(t + FIRE_MS, () => setAtk(null));
        t += FIRE_MS;
      }
    };
    ev.steps.forEach((step, i) => {
      fireAt(i);
      const before = board;
      const cleared = step.cleared;
      // Tiles that fill one of the mover's bars (or the berries) fly there and count up, like Yatzy dice.
      const groups = new Map<string, { target: string; cells: number[]; src: string }>();
      if (!step.bomb && !reducedMotion()) {
        for (const cell of cleared) {
          const tile = before[cell];
          if (!tile) continue;
          let target: string | null = null;
          if (tile.k === 'berry') target = `mates-berries-${who}`;
          else {
            const slot = mover?.monsters.findIndex((m) => m.element === tile.k) ?? -1;
            if (slot >= 0) target = `mates-mana-${who}-${slot}`;
          }
          if (!target) continue;
          const g = groups.get(target) ?? { target, cells: [], src: tileUrl(tile) };
          g.cells.push(cell);
          groups.set(target, g);
        }
      }
      // The artist's glow bursts round the cleared tiles, in the colour of their kind.
      if (cleared.length > 0 && !step.bomb) {
        const items = cleared.map((cell) => ({ cell, kind: before[cell]?.k ?? 'gold' }));
        for (let f = 0; f < 8; f++) at(t + f * 55, () => setGlow({ items, frame: f }));
        at(t + 8 * 55, () => setGlow(null));
      }
      at(t, () => {
        const flown = new Set<number>();
        const flying: Flight[] = [];
        for (const g of groups.values()) {
          const to = centerOf(g.target);
          if (!to) continue;
          const stagger = Math.max(25, Math.min(110, FLY_SPREAD_MS / g.cells.length));
          g.cells.forEach((cell, n) => {
            const from = centerOf(`mates-cell-${cell}`);
            if (!from) return;
            flown.add(cell);
            flying.push({
              id: ++flightId + ev.seq * 1000 + i * 100,
              src: g.src,
              x: from.x,
              y: from.y,
              dx: to.x - from.x,
              dy: to.y - from.y,
              size: 28,
              delay: n * stagger,
            });
            // Each arrival raises the running total over the bar.
            at(t + n * stagger + FLY_MS, () => {
              tick(n);
              setTallies((all) => [
                ...all.filter((x) => x.key !== g.target + i),
                { key: g.target + i, x: to.x, y: to.y, n: n + 1 },
              ]);
            });
            // ...and it moves away 3 seconds after its last change.
            at(t + n * stagger + FLY_MS + TALLY_MS, () =>
              setTallies((all) => all.filter((x) => x.key !== g.target + i || x.n !== n + 1)),
            );
          });
        }
        setFlights((all) => [...all, ...flying]);
        setAnim({ board: before, flash: new Set(cleared), key, flown });
        chainSound(i);
        if (i >= 1) setCombo({ id: ev.seq * 100 + i, level: i + 1 });
        if (i >= 1)
          setSparks((sp) => [
            ...sp,
            ...cleared.slice(0, 14).map((cell) => ({
              id: ++sparkId + ev.seq * 1000 + i * 100,
              cell,
              emoji: i >= 2 ? '🪙' : '✨',
              dx: Math.round((Math.random() - 0.5) * 120),
            })),
          ]);
      });
      at(t + (cleared.length > 0 ? FLASH_MS : 0), () =>
        setAnim({
          board: step.board,
          flash: new Set(),
          drops: cleared.length > 0 ? dropsFor(cleared) : undefined,
          key: ++key,
        }),
      );
      board = step.board;
      t += STEP_MS;
    });
    fireAt(ev.steps.length);
    at(t, () => {
      setAnim(null);
      setAtk(null);
      setHit(null);
      setGlow(null);
      setFlights([]);
    });
    // What the move earned besides damage: said out loud, with a pop on the hit points.
    if (ev.heal > 0) {
      say(`Match of ${ev.longest}: +${ev.heal} HP!`, 'good', t);
      at(t, () => {
        play('score');
        setHpShown((h) =>
          h ? { ...h, [ev.by]: Math.min(hpMax[ev.by] ?? 0, (h[ev.by] ?? 0) + ev.heal) } : h,
        );
        const [hx, hy] = ev.by === me ? [30, 44] : [108, 44];
        setPops((p) => [
          ...p,
          { id: ++popId + ev.seq * 100, x: hx, y: hy, text: `+${ev.heal}`, tone: 'heal' },
        ]);
      });
      t += NOTE_MS;
    }
    if (ev.extraMove) {
      say('Extra move!', 'good', t);
      at(t, () => play('turn'));
      t += NOTE_MS;
    }
    at(t + 700, () => {
      setHpShown(null);
      setPops([]);
      setCombo(null);
      setSparks([]);
      setNote(null);
    });
    return () => {
      timers.forEach(clearTimeout);
      setAnim(null);
      setAtk(null);
      setHit(null);
      setGlow(null);
      setCombo(null);
      setSparks([]);
      setFlights([]);
      setTallies([]);
      setNote(null);
      setEvolve(null);
      setHpShown(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.moveCount]);

  useEffect(() => {
    if (lastPhase.current === 'pick' && view.phase === 'play') {
      setCoin(true);
      play('turn');
      const t = setTimeout(() => setCoin(false), matchmates.COIN_MS);
      lastPhase.current = view.phase;
      return () => clearTimeout(t);
    }
    lastPhase.current = view.phase;
  }, [view.phase]);
  useEffect(() => {
    if (!coin || view.phase !== 'play' || view.moveCount > 0) return;
    // (Opened the game mid-flip, e.g. after a reload.)
    const t = setTimeout(() => setCoin(false), matchmates.COIN_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animating = anim !== null;
  // "Your turn!" in the middle of the screen when the turn comes to me (after the last move has played out).
  const [turnBanner, setTurnBanner] = useState(0);
  // (starts false: the very first turn is announced too, after the coin flip)
  const wasMine = useRef(false);
  const settled = !animating && !coin && flights.length === 0;
  useEffect(() => {
    if (!myTurn) wasMine.current = false;
    else if (!wasMine.current && settled) {
      wasMine.current = true;
      if (reducedMotion()) return;
      play('turn');
      haptic('tap');
      setTurnBanner((n) => n + 1);
      const t = setTimeout(() => setTurnBanner(0), 1300);
      return () => clearTimeout(t);
    }
  }, [myTurn, settled, view.moveCount]);
  const board = anim?.board ?? view.board;
  const canAct = myTurn && !busy && !animating;

  const trySwap = (a: number, b: number) => {
    setSelected(null);
    if (!matchmates.adjacent(a, b)) return;
    haptic('tap');
    void send({ type: 'swap', a, b });
  };
  const tap = (i: number) => {
    if (!canAct) return;
    if (selected === null) setSelected(i);
    else if (selected === i) setSelected(null);
    else if (matchmates.adjacent(selected, i)) trySwap(selected, i);
    else setSelected(i);
  };
  const drag = useRef<{ i: number; x: number; y: number } | null>(null);
  const onDown = (i: number, e: React.PointerEvent) => {
    drag.current = { i, x: e.clientX, y: e.clientY };
  };
  const onUp = (i: number, e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !canAct) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) {
      if (d.i === i) tap(i);
      return;
    }
    const to =
      Math.abs(dx) > Math.abs(dy) ? d.i + (dx > 0 ? 1 : -1) : d.i + (dy > 0 ? COLS : -COLS);
    if (
      to < 0 ||
      to >= CELLS ||
      (Math.abs(dx) > Math.abs(dy) && Math.floor(to / COLS) !== Math.floor(d.i / COLS))
    )
      return;
    trySwap(d.i, to);
  };

  const stage = view.stage ?? 'stadium';
  const winnerName = useMemo(
    () => (view.winner ? (memberOf(view.winner)?.nickname ?? 'Opponent') : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.winner, room.members],
  );

  if (view.phase === 'pick') {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-testid="mates-game"
        data-phase={view.phase}
      >
        <Pick
          view={view}
          busy={busy}
          people={room.members.map((m) => ({ id: m.id, name: m.nickname, avatar: m.avatar }))}
          onDraft={(element) => void send({ type: 'draft', element })}
          onConfirm={(stage) => void send({ type: 'confirm', stage })}
        />
      </div>
    );
  }

  const evolveBerries = evolveCost(stage);
  const W = SCREEN.w;
  const H = SCREEN.h;
  /** A box in screen art pixels as % of the stage (the whole screen is laid out in art pixels, like the reference). */
  const at = (x: number, y: number, w?: number, h?: number) => ({
    left: `${(x / W) * 100}%`,
    top: `${((y - SCREEN.top) / H) * 100}%`,
    ...(w !== undefined ? { width: `${(w / W) * 100}%` } : {}),
    ...(h !== undefined ? { height: `${(h / H) * 100}%` } : {}),
  });
  const cq = (artPx: number) => `${(artPx / W) * 100}cqw`;
  const hudText = {
    fontSize: cq(7.5),
    lineHeight: 1,
    textShadow: '0 1px 0 #101628, 0 0 2px #101628',
  } as const;

  const hudSide = (p: matchmates.MatePlayer, who: 'me' | 'opp') => {
    const member = memberOf(p.id);
    const stackX = who === 'me' ? 19 : 98;
    const avatarX = who === 'me' ? 46 : 72;
    const turn = view.turn === p.id && view.phase === 'play' && !finished;
    return (
      <div data-testid={who === 'me' ? 'mates-me' : 'mates-opp'}>
        <img
          src={hudUrl('berry')}
          alt="Berries"
          draggable={false}
          className="absolute"
          style={{ ...px, ...at(stackX, 20, 9) }}
        />
        <span
          className="absolute font-black text-white"
          style={{ ...hudText, ...at(stackX + 11, 21.5) }}
          data-testid={`mates-berries-${who}`}
        >
          {p.berries}/{BERRIES_TO_EVOLVE}
        </span>
        <img
          src={hudUrl('heart')}
          alt="Hit points"
          draggable={false}
          className="absolute"
          style={{ ...px, ...at(stackX, 32, 9) }}
        />
        <span
          className="absolute font-black text-white"
          style={{ ...hudText, ...at(stackX + 11, 32.5) }}
          data-testid={`mates-hp-${who}`}
          title={`${hpShown?.[p.id] ?? p.hp}/${p.maxHp} HP`}
        >
          {hpShown?.[p.id] ?? p.hp}
        </span>
        <div className="absolute" style={at(avatarX, 19, 22)}>
          <Avatar
            avatar={member?.avatar ?? '🙂'}
            size="fluid"
            className={`h-[15.7cqw] w-[15.7cqw] text-[9cqw] ${turn ? '!border-white' : ''}`}
          />
        </div>
        <div
          className="absolute text-center font-black uppercase text-white"
          style={{
            ...at(avatarX - 4, 43, 30),
            fontSize: cq(5),
            lineHeight: 1,
            textShadow: hudText.textShadow,
          }}
        >
          <PlayerName name={p.id === me ? 'You' : (member?.nickname ?? 'Opponent')} />
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center gap-1.5 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      data-testid="mates-game"
      data-phase={view.phase}
    >
      <style>{`
        @keyframes mates-lunge { 0%{transform:translateX(0)} 40%{transform:translateX(var(--lunge))} 100%{transform:translateX(0)} }
        @keyframes mates-pop { 0%{opacity:0;transform:translateY(0) scale(.6)} 20%{opacity:1;transform:translateY(-6px) scale(1.2)} 100%{opacity:0;transform:translateY(-28px) scale(1)} }
        @keyframes mates-flash { 0%{transform:scale(1);filter:none} 45%{transform:scale(1.25);filter:brightness(2.4)} 100%{transform:scale(0);opacity:0} }
        @keyframes mates-fall { 0%{transform:translateY(calc(var(--drop) * -100%))} 68%{transform:translateY(0)} 82%{transform:translateY(-7%)} 100%{transform:translateY(0)} }
        @keyframes mates-spark { 0%{opacity:1;transform:translate(0,0) scale(.6)} 100%{opacity:0;transform:translate(var(--dx),70px) scale(1.1)} }
        @keyframes mates-combo { 0%{opacity:0;transform:scale(.4) rotate(-6deg)} 25%{opacity:1;transform:scale(1.25) rotate(3deg)} 100%{opacity:0;transform:scale(1) translateY(-30px)} }
        @keyframes mates-turn { 0%{opacity:0;transform:scale(.3) rotate(-8deg)} 20%{opacity:1;transform:scale(1.25) rotate(3deg)} 35%{transform:scale(1) rotate(0)} 80%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(1.4)} }
        @keyframes mates-slide { 0%{transform:translate(calc(var(--sx) * (100% + 2px)), calc(var(--sy) * (100% + 2px))) scale(1.12)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes mates-fly { 0%{opacity:1;transform:translate(0,0) scale(1.1)} 100%{opacity:.9;transform:translate(var(--fx),var(--fy)) scale(.45)} }
        @keyframes mates-tally-away { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-16px)} }
        @keyframes mates-tally { 0%{transform:translate(-50%,-50%) scale(.6)} 50%{transform:translate(-50%,-50%) scale(1.35)} 100%{transform:translate(-50%,-50%) scale(1)} }
        @keyframes mates-note { 0%{opacity:0;transform:scale(.5)} 18%{opacity:1;transform:scale(1.15)} 30%{transform:scale(1)} 85%{opacity:1} 100%{opacity:0;transform:translateY(-14px)} }
        @keyframes mates-charge { 0%{filter:brightness(1);transform:scaleX(var(--flip)) translateX(0)} 25%{transform:scaleX(var(--flip)) translateX(-2px)} 50%{transform:scaleX(var(--flip)) translateX(2px)} 75%{transform:scaleX(var(--flip)) translateX(-3px) scale(1.06)} 100%{filter:brightness(5) saturate(0);transform:scaleX(var(--flip)) translateX(3px) scale(1.15)} }
        @keyframes mates-evolve-pop { 0%{filter:brightness(5) saturate(0);transform:scaleX(var(--flip)) scale(.7)} 45%{filter:brightness(2);transform:scaleX(var(--flip)) scale(1.25)} 100%{filter:none;transform:scaleX(var(--flip)) scale(1)} }
        @keyframes mates-glow-up { 0%{opacity:0;transform:translate(-50%,-50%) scale(.3)} 100%{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes mates-glow-out { 0%{opacity:1;transform:translate(-50%,-50%) scale(1)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.8)} }
        @keyframes mates-burst { 0%{opacity:1;transform:translate(-50%,0) scale(.5)} 100%{opacity:0;transform:translate(calc(-50% + var(--ex)),var(--ey)) scale(1.3)} }
        @keyframes mates-shake { 0%,100%{transform:translate(0)} 20%{transform:translate(-3px,2px)} 40%{transform:translate(3px,-2px)} 60%{transform:translate(-2px,-2px)} 80%{transform:translate(2px,2px)} }
        @keyframes mates-hit { 0%{transform:translateX(0);filter:none} 10%{transform:translateX(-2px);filter:brightness(5) saturate(0)} 25%{transform:translateX(2px);filter:brightness(5) saturate(0)} 40%{transform:translateX(-2px);filter:none} 55%{transform:translateX(1px);filter:brightness(3)} 70%{transform:translateX(-1px);filter:none} 100%{transform:translateX(0);filter:none} }
      `}</style>

      {/* The battle screen: 140 x 258 art pixels like the reference, everything placed in art pixels. */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{
          containerType: 'inline-size',
          width: 'min(100%, calc((100dvh - 9.5rem - env(safe-area-inset-top)) * 140 / 258))',
          aspectRatio: `${W} / ${H}`,
        }}
        data-testid="mates-arena"
      >
        <img
          src={portraitUrl(stage, STAGE_SPECS)}
          alt={STAGE_SPECS[stage].name}
          draggable={false}
          style={px}
          className="absolute inset-0 h-full w-full"
        />

        {/* HUD: back, berries + hit points and the picture of each player, the menu. */}
        <button
          type="button"
          aria-label="Leave game"
          data-testid="leave-game"
          onClick={() => chrome?.onLeave()}
          className="absolute"
          style={at(3, 19, 13)}
        >
          <img src={hudUrl('button-back')} alt="" draggable={false} style={px} className="w-full" />
        </button>
        <button
          type="button"
          aria-label="Menu"
          data-testid="mates-menu"
          onClick={() => chrome?.onSettings()}
          className="absolute"
          style={at(124, 19, 13)}
        >
          <img src={hudUrl('button-menu')} alt="" draggable={false} style={px} className="w-full" />
        </button>
        {hudSide(mine, 'me')}
        {hudSide(theirs, 'opp')}
        <div
          className="absolute flex flex-col gap-[0.6cqw] font-black uppercase"
          style={{ ...at(3, 51), fontSize: cq(5), lineHeight: 1 }}
        >
          {['4 = Extra move', '5 = Heal'].map((t) => (
            <span
              key={t}
              className="w-fit border border-[#101628] bg-[#1b2338]/80 px-[1.2cqw] py-[0.6cqw] text-[#a8e063]"
            >
              {t}
            </span>
          ))}
        </div>

        {/* The pets: mine on the left, the opponent's on the right, back row and front row. */}
        {[
          { p: mine, who: 'me' as const },
          { p: theirs, who: 'opp' as const },
        ].map(({ p, who }) =>
          p.monsters.map((m, slot) => {
            const [fx, fy] = SCREEN.slots[who][slot] as readonly [number, number];
            const evolving = evolve?.owner === p.id && evolve.slot === slot ? evolve.phase : null;
            // While it charges up the old form still shows; the new one pops out of the flash.
            const shownEvolved = m.evolved && evolving !== 'charge';
            const [w, h] = monsterSize(shownEvolved);
            const spec = MONSTERS[m.element];
            const hitting = hit?.owner === p.id && hit.slot === slot;
            const color = ELEMENT_COLOR[m.element];
            return (
              <div key={`${p.id}-${slot}`}>
                <div
                  className="absolute cursor-pointer"
                  style={at(fx - w / 2, fy - h, w)}
                  onClick={(e) => petInfo.open(e, m.element, shownEvolved)}
                  data-testid={`mates-monster-${who}-${slot}`}
                >
                  {evolving && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-1/2 h-[170%] w-[170%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      data-testid="mates-evolve-glow"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,214,90,.7) 35%, rgba(255,214,90,0) 70%)',
                        animation:
                          evolving === 'charge'
                            ? `mates-glow-up ${EVOLVE_MS * 0.55}ms ease-in forwards`
                            : `mates-glow-out ${EVOLVE_MS * 0.45}ms ease-out forwards`,
                      }}
                    />
                  )}
                  <img
                    key={`${shownEvolved}`}
                    src={monsterUrl(m.element, shownEvolved)}
                    alt={spec.names[shownEvolved ? 1 : 0]}
                    draggable={false}
                    className="relative w-full"
                    style={{
                      ...px,
                      ['--flip' as string]: 1,
                      animation:
                        evolving === 'charge'
                          ? `mates-charge ${EVOLVE_MS * 0.55}ms ease-in forwards`
                          : evolving === 'pop'
                            ? `mates-evolve-pop ${EVOLVE_MS * 0.45}ms ease-out`
                            : hitting
                              ? 'mates-hit 450ms linear'
                              : undefined,
                    }}
                  />
                  {evolving === 'pop' &&
                    [0, 1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-1/3 text-lg"
                        style={{
                          ['--ex' as string]: `${Math.round(Math.cos((n / 6) * 6.283) * 46)}px`,
                          ['--ey' as string]: `${Math.round(Math.sin((n / 6) * 6.283) * 46)}px`,
                          animation: `mates-burst ${EVOLVE_MS * 0.45}ms ease-out forwards`,
                        }}
                      >
                        ✨
                      </span>
                    ))}
                </div>
                {/* The mana bar: the artist's badge + bar with the fill and the count drawn over it. */}
                <div
                  className="absolute"
                  style={at(fx - 18, fy + 1, 36)}
                  title={`${spec.names[shownEvolved ? 1 : 0]}: ${m.mana}/${spec.cost} mana`}
                >
                  <img
                    src={hudUrl(`charge-bar-${m.element}`)}
                    alt=""
                    draggable={false}
                    style={px}
                    className="w-full"
                  />
                  <span
                    aria-hidden
                    className="absolute transition-[width] duration-500"
                    style={{
                      left: `${(11 / 36) * 100}%`,
                      top: `${(3 / 12) * 100}%`,
                      height: `${(5 / 12) * 100}%`,
                      width: `${(24 / 36) * 100 * Math.min(1, m.mana / spec.cost)}%`,
                      background: color,
                    }}
                  />
                  <span
                    className="absolute text-center font-black text-white"
                    style={{
                      left: `${(11 / 36) * 100}%`,
                      width: `${(24 / 36) * 100}%`,
                      top: `${(2.6 / 12) * 100}%`,
                      fontSize: cq(5),
                      lineHeight: 1,
                      textShadow: '0 1px 0 #101628, 0 0 2px #101628',
                    }}
                    data-testid={`mates-mana-${who}-${slot}`}
                  >
                    {Math.min(m.mana, spec.cost)}/{spec.cost}
                  </span>
                </div>
              </div>
            );
          }),
        )}

        {/* The board: the see-through panel and the 7 x 5 tiles, exactly on the art grid. */}
        <img
          src={boardPanelUrl}
          alt=""
          draggable={false}
          style={{ ...px, ...at(SCREEN.panel.x, SCREEN.panel.y, SCREEN.panel.w) }}
          className="absolute"
        />
        <div
          className="absolute"
          style={{
            ...at(SCREEN.boardX, SCREEN.boardY, COLS * SCREEN.cell, ROWS * SCREEN.cell),
            animation:
              combo && combo.level >= 3 && anim ? 'mates-shake 300ms ease-in-out' : undefined,
          }}
          key={combo && combo.level >= 3 ? combo.id : 'calm'}
        >
          <div
            className="grid h-full w-full touch-none select-none"
            style={{
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            }}
            data-testid="mates-board"
          >
            {board.map((cell, i) => {
              const drop = anim?.drops?.[i] ?? 0;
              const flashing = anim?.flash.has(i) && !anim.flown?.has(i);
              const flownAway = !!anim?.flown?.has(i);
              const swapIdx = anim?.swap ? anim.swap.indexOf(i) : -1;
              // The tile now at i came from the other square of the swap: slide it over from there.
              const from = swapIdx >= 0 && anim?.swap ? (anim.swap[1 - swapIdx] as number) : -1;
              return (
                <button
                  key={i}
                  type="button"
                  data-testid={`mates-cell-${i}`}
                  data-kind={cell.k}
                  aria-label={`${cell.k}${cell.frozen ? ' (frozen)' : ''}`}
                  onPointerDown={(e) => onDown(i, e)}
                  onPointerUp={(e) => onUp(i, e)}
                  onPointerCancel={() => (drag.current = null)}
                  className={`relative min-h-0 min-w-0 overflow-visible p-0 ${
                    selected === i ? 'outline outline-2 -outline-offset-2 outline-white' : ''
                  }`}
                >
                  <img
                    key={`${i}-${anim?.key ?? 0}`}
                    src={tileUrl(cell)}
                    alt=""
                    draggable={false}
                    className="h-full w-full"
                    style={{
                      ...px,
                      ['--drop' as string]: drop,
                      ['--sx' as string]: from >= 0 ? (from % COLS) - (i % COLS) : 0,
                      ['--sy' as string]:
                        from >= 0 ? Math.floor(from / COLS) - Math.floor(i / COLS) : 0,
                      position: from >= 0 ? 'relative' : undefined,
                      zIndex: from >= 0 ? 5 : undefined,
                      opacity: flownAway ? 0 : undefined,
                      animation: flashing
                        ? `mates-flash ${FLASH_MS}ms ease-in forwards`
                        : from >= 0
                          ? `mates-slide ${SWAP_MS - 20}ms cubic-bezier(.4,0,.2,1)`
                          : drop > 0
                            ? `mates-fall ${STEP_MS - FLASH_MS}ms cubic-bezier(.35,0,.6,1) ${(i % COLS) * 18}ms backwards`
                            : undefined,
                    }}
                  />
                  {cell.frozen && (
                    <img
                      src={iceUrl()}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 h-full w-full"
                      style={px}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
            {/* The artist's match glow bursts round the cleared tiles. */}
            {glow?.items.map(({ cell, kind }) => (
              <img
                key={cell}
                src={glowUrl(kind, 'burst', glow.frame)}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{
                  ...px,
                  left: `${(((cell % COLS) * SCREEN.cell - 7) / (COLS * SCREEN.cell)) * 100}%`,
                  top: `${((Math.floor(cell / COLS) * SCREEN.cell - 7) / (ROWS * SCREEN.cell)) * 100}%`,
                  width: `${(32 / (COLS * SCREEN.cell)) * 100}%`,
                }}
              />
            ))}
            {sparks.map((sp) => (
              <span
                key={sp.id}
                className="absolute text-lg"
                style={{
                  left: `${(((sp.cell % COLS) + 0.5) / COLS) * 100}%`,
                  top: `${((Math.floor(sp.cell / COLS) + 0.5) / ROWS) * 100}%`,
                  ['--dx' as string]: `${sp.dx}px`,
                  animation: 'mates-spark 750ms ease-out forwards',
                }}
              >
                {sp.emoji}
              </span>
            ))}
            {note && (
              <span
                key={note.id}
                data-testid="mates-note"
                role="status"
                className={`absolute left-1/2 top-1/2 w-max max-w-full -translate-x-1/2 -translate-y-1/2 text-center font-black [text-shadow:0_3px_0_#101628,0_0_12px_#000] ${
                  note.tone === 'bad'
                    ? 'text-red-300'
                    : note.tone === 'good'
                      ? 'text-green-300'
                      : 'text-yellow-200'
                }`}
                style={{
                  fontSize: '6.5cqw',
                  animation: `mates-note ${NOTE_MS + 200}ms ease-out forwards`,
                }}
              >
                {note.text}
              </span>
            )}
            {combo && (
              <span
                key={combo.id}
                data-testid="mates-combo"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black text-yellow-300 [text-shadow:0_3px_0_#101628,0_0_14px_#ff9d00]"
                style={{
                  fontSize: `${Math.min(9, 4.5 + combo.level * 0.8)}cqw`,
                  animation: 'mates-combo 900ms ease-out forwards',
                }}
              >
                CHAIN x{combo.level}!
              </span>
            )}
          </div>
        </div>
        {/* Not my turn: the field is dimmed to half brightness. */}
        <div
          aria-hidden
          data-testid="mates-dim"
          data-on={!myTurn && !finished}
          className="pointer-events-none absolute bg-black/50 transition-opacity duration-300"
          style={{
            ...at(SCREEN.panel.x, SCREEN.panel.y, SCREEN.panel.w, SCREEN.panel.h),
            opacity: !myTurn && !finished ? 1 : 0,
          }}
        />

        {atk && <Attack fx={atk} onDone={() => setAtk(null)} />}
        {pops.map((p) => (
          <span
            key={p.id}
            className="pointer-events-none absolute z-30 -translate-x-1/2 font-black text-white"
            style={{
              ...at(p.x, p.y),
              fontSize: cq(6),
              textShadow: '0 2px 0 #101628',
              animation: 'mates-pop 900ms ease-out forwards',
            }}
          >
            {/^[-+]\d+$/.test(p.text) ? (
              <Digits text={p.text} tone={p.tone === 'heal' ? 'heal' : 'dmg'} />
            ) : (
              p.text
            )}
          </span>
        ))}
      </div>

      <div className="flex w-full max-w-lg items-center justify-between gap-2 px-2 text-xs font-bold">
        <span data-testid="mates-turn" className={myTurn ? 'text-neon' : 'text-muted'}>
          {finished
            ? `${winnerName === 'You' || view.winner === me ? 'You win' : `${winnerName ?? 'Opponent'} wins`}!`
            : myTurn
              ? 'Your turn'
              : `${memberOf(view.turn)?.nickname ?? 'Opponent'}'s turn`}
        </span>
        <span
          className="flex items-center gap-1"
          data-testid="mates-moves"
          aria-label={`${view.movesLeft} moves left`}
        >
          {Array.from({ length: Math.max(2, view.movesLeft) }, (_, i) => (
            <span
              key={i}
              className={`inline-block h-3 w-3 rotate-45 border-2 border-edge ${
                i < view.movesLeft && !finished ? 'bg-accent' : 'bg-black/40'
              }`}
            />
          ))}
        </span>
        <span className="flex gap-1">
          {mine.monsters.map((m, slot) => {
            const spec = MONSTERS[m.element];
            const need = m.evolved ? BERRIES_TO_EVOLVE : evolveBerries;
            const full = mine.berries >= need;
            const can = canAct && full;
            return (
              <Button
                key={slot}
                variant="secondary"
                data-testid={`mates-${m.evolved ? 'boost' : 'evolve'}-${slot}`}
                disabled={!can}
                className="relative !min-h-0 overflow-hidden !px-2 !py-1 text-[11px]"
                style={{ borderColor: ELEMENT_COLOR[m.element] }}
                onClick={() => void send({ type: m.evolved ? 'boost' : 'evolve', slot })}
              >
                {/* A loading bar of the berries; it pulses when it is full (n/n). */}
                <span
                  aria-hidden
                  data-testid={`mates-bar-${slot}`}
                  data-full={full}
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${
                    full ? 'animate-pulse' : ''
                  }`}
                  style={{
                    width: `${Math.min(100, (mine.berries / need) * 100)}%`,
                    background: ELEMENT_COLOR[m.element],
                  }}
                />
                <span className="relative text-white [text-shadow:0_1px_0_#101628,0_0_2px_#101628]">
                  {m.evolved ? 'Boost' : 'Evolve'} {spec.names[m.evolved ? 1 : 0]} (
                  {Math.min(mine.berries, need)}/{need})
                </span>
              </Button>
            );
          })}
          <Button
            variant="secondary"
            data-testid="mates-chat"
            className="relative !min-h-0 !px-2 !py-1 text-[11px]"
            aria-label={chrome && chrome.unread > 0 ? `Chat, ${chrome.unread} unread` : 'Chat'}
            onClick={() => chrome?.onChat()}
          >
            💬{chrome && chrome.unread > 0 ? ` ${chrome.unread}` : ''}
          </Button>
        </span>
      </div>
      <TimerDrain
        deadline={game.deadline}
        serverTime={room.serverTime}
        totalSec={room.turnTimeSec}
        urgent={secondsLeft !== null && secondsLeft <= 5}
        active={myTurn}
      />

      {petInfo.bubble}
      {turnBanner > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          aria-hidden
        >
          <span
            key={turnBanner}
            data-testid="mates-your-turn"
            className="text-5xl font-black uppercase tracking-wider text-yellow-300 [text-shadow:0_4px_0_#101628,0_0_22px_#ff9d00]"
            style={{ animation: 'mates-turn 1300ms ease-out forwards' }}
          >
            Your turn!
          </span>
        </div>
      )}
      {(flights.length > 0 || tallies.length > 0) && (
        <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
          {flights.map((f) => (
            <img
              key={f.id}
              src={f.src}
              alt=""
              className="absolute"
              style={{
                ...px,
                left: f.x - f.size / 2,
                top: f.y - f.size / 2,
                width: f.size,
                height: f.size,
                ['--fx' as string]: `${f.dx}px`,
                ['--fy' as string]: `${f.dy}px`,
                animation: `mates-fly ${FLY_MS}ms ease-in ${f.delay}ms both`,
              }}
            />
          ))}
          {tallies.map((t) => (
            <span
              key={t.key}
              data-testid="mates-tally"
              className="absolute"
              style={{
                left: t.x,
                top: t.y - 18,
                animation: `mates-tally-away 500ms ease-in ${TALLY_MS - 500}ms both`,
              }}
            >
              <span
                key={t.n}
                className="block text-xl font-black text-white [text-shadow:0_2px_0_#101628,0_0_6px_#101628]"
                style={{ animation: 'mates-tally 200ms ease-out both' }}
              >
                +{t.n}
              </span>
            </span>
          ))}
        </div>
      )}
      {coin && view.coinWinner && (
        <Coin
          meAvatar={memberOf(me)?.avatar ?? '🙂'}
          oppAvatar={memberOf(theirs.id)?.avatar ?? '🙂'}
          oppName={memberOf(theirs.id)?.nickname ?? 'Opponent'}
          iWon={view.coinWinner === me}
          stage={stage}
        />
      )}
    </div>
  );
}
