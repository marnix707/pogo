import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { matchmates } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, TimerDrain } from '../../components/ui';
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
  arenaEdgeColors,
  berryShineUrl,
  chargedUrl,
  portraitUrl,
  DROP_AT,
  END_FALL_MS,
  FAINT_AT,
  FAINT_MS,
  WIN_AT,
  WIN_MS,
  END_ROW_MS,
  readySparkleUrl,
  tileUrl,
} from './art';
import { ATTACK, Attack, Digits } from './Attack';
import { Blast } from './Blast';
import { FitText } from './FitText';
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
  STEP_MS,
  CHANGE_MS,
  FIRE_MS,
  SWAP_MS,
  EVOLVE_MS,
  NOTE_MS,
  boostMana,
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
  /** Where the action is, in % of the board (negative / over 100 = beside it, e.g. up at the player's picture). */
  x: number;
  y: number;
}
/** Screen art pixels to % of the board (the texts sit on the board layer). */
const boardPct = (x: number, y: number): [number, number] => [
  ((x - SCREEN.boardX) / (COLS * SCREEN.cell)) * 100,
  ((y - SCREEN.boardY) / (ROWS * SCREEN.cell)) * 100,
];
/** The middle of some squares, in % of the board, kept where a text fits. */
const cellsPct = (cells: readonly number[]): [number, number] => {
  const n = Math.max(1, cells.length);
  const x = cells.reduce((s, c) => s + ((c % COLS) + 0.5) / COLS, 0) / n;
  const y = cells.reduce((s, c) => s + (Math.floor(c / COLS) + 0.5) / ROWS, 0) / n;
  return [Math.max(24, Math.min(76, x * 100)), Math.max(10, Math.min(90, y * 100))];
};
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
  tone?: 'heal' | 'dmg';
}
/** The artist's match glow bursting round the cleared tiles (frames 0-7). */
interface GlowState {
  items: { cell: number; kind: string }[];
  frame: number;
}
/** Where each player's hit points are on the screen (art pixels): attacks fly there. */
const HP_SPOT = { me: [24, 45], opp: [128, 45] } as const;
/** The sparkles round a ready pet: sideways spot (% of the pet's width from its middle) and start delay. */
const READY_SPARKLES: readonly (readonly [number, number])[] = [
  [-48, 0],
  [38, 300],
  [-20, 700],
  [8, 1000],
  [50, 1300],
  [-36, 1500],
];
/** The intro after the coin flip (ms from its start): the pets spawn, then the tiles drop in. */
const INTRO_PET_AT = 450;
const INTRO_PET_STEP = 230;
const INTRO_TILES_AT = 1250;
const INTRO_ROW_MS = 110;
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
const TALLY_MS = 1000;

const centerOf = (testId: string): { x: number; y: number } | null => {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export function MatchMatesGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const view = game.view as matchmates.MatesView;
  const finished = room.status === 'finished' || view.phase === 'over';
  const myTurn = view.phase === 'play' && !finished && view.turn === me;
  const memberOf = (id: string) => room.members.find((m) => m.id === id);
  const secondsLeft = useCountdown(game.deadline, room.serverTime);
  useTimeWarning(secondsLeft, myTurn || view.phase === 'pick');

  const mine = view.players.find((p) => p.id === me) ?? view.players[0]!;
  const theirs = view.players.find((p) => p.id !== mine.id)!;

  // The colours of the arena's top and bottom edge: painted over the whole screen behind the arena.
  const [edges, setEdges] = useState<{ top: string; bottom: string } | null>(null);
  const arenaPicture = portraitUrl(view.stage ?? 'stadium', STAGE_SPECS);
  useEffect(() => {
    let live = true;
    void arenaEdgeColors(arenaPicture).then((c) => live && setEdges(c));
    return () => {
      live = false;
    };
  }, [arenaPicture]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [combo, setCombo] = useState<{ id: number; level: number; x: number; y: number } | null>(
    null,
  );
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
  // The opponent's hit points flash red and shake when an attack lands on them.
  const [hpHit, setHpHit] = useState<{ owner: string } | null>(null);
  // Whose hit points are being counted down right now: shown red, bold and bigger while it happens.
  const [hpCounting, setHpCounting] = useState<{ owner: string; tone: 'dmg' | 'heal' } | null>(
    null,
  );
  const [glow, setGlow] = useState<GlowState | null>(null);
  // The game is over: every tile drops off the board, row by row from the bottom, each with its own little tilt.
  const [dropping, setDropping] = useState(view.phase === 'over' && !reducedMotion());
  // The finale: the losing pets faint, the winning pets walk to the middle (then the board falls away).
  const [finale, setFinale] = useState<'none' | 'faint' | 'win' | 'done'>(
    view.phase === 'over' ? 'done' : 'none',
  );
  // The Reactor's bombs: a big explosion on every tile that blows up, rippling out from the bomb.
  const [blasts, setBlasts] = useState<{ id: number; cell: number; delay: number }[]>([]);
  // True from the moment a move arrives until its whole animation (cascades, attacks) has played: the turn only
  // changes on screen when the field is stable.
  const seen = useRef(view.moveCount);
  // Unique ids for everything the replay puts on screen (React keys).
  const idCounter = useRef(0);
  const nextId = () => ++idCounter.current;
  const [replayingState, setReplaying] = useState(false);
  // A move that has just arrived but whose replay has not started yet (the effects run after this render):
  // it counts as replaying right away, so nothing ("Your turn", the banner) shows for it before it has played.
  const replaying =
    replayingState || (view.moveCount > seen.current && !!view.lastEvent && !reducedMotion());
  // Hit points as the animation has got to: they change when the attack lands, not when the move arrives.
  const hpNow = Object.fromEntries(view.players.map((p) => [p.id, p.hp]));
  const prevHp = useRef<Record<string, number>>(hpNow);
  const [hpShown, setHpShown] = useState<Record<string, number> | null>(null);
  const hpShownRef = useRef(hpShown);
  hpShownRef.current = hpShown;
  const hpMax = Object.fromEntries(view.players.map((p) => [p.id, p.maxHp]));
  // The mana bars too: they fill when the tiles land and empty when the pet attacks, not when the move arrives.
  const manaNow = Object.fromEntries(
    view.players.flatMap((p) => p.monsters.map((m, slot) => [`${p.id}-${slot}`, m.mana])),
  );
  const prevMana = useRef<Record<string, number>>(manaNow);
  const [manaShown, setManaShown] = useState<Record<string, number> | null>(null);
  // The moves left as the animation has got to: the move is spent after the swap, an extra move is added at the end
  // (the new diamond rises from below, with a +1).
  const prevMoves = useRef(view.movesLeft);
  const movesStart = useRef(view.movesLeft);
  const [movesShown, setMovesShown] = useState<number | null>(null);
  const [bonus, setBonus] = useState<number | null>(null);
  // Before the first paint of a new move: keep showing the hit points from before it.
  useLayoutEffect(() => {
    if (view.moveCount > seen.current && view.lastEvent && !reducedMotion()) {
      setReplaying(true);
      setHpShown({ ...prevHp.current });
      setManaShown({ ...prevMana.current });
      setMovesShown(prevMoves.current);
      movesStart.current = prevMoves.current;
    }
    prevHp.current = hpNow;
    prevMana.current = manaNow;
    prevMoves.current = view.movesLeft;
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
    let board = ev.swapped ?? ev.before ?? view.board;
    let key = 0;
    const who = ev.by === me ? 'me' : 'opp';
    const mover = view.players.find((p) => p.id === ev.by);
    const petAt = (id: string, slot: number): [number, number] => {
      const spot =
        SCREEN.slots[id === me ? 'me' : 'opp'][slot] ?? SCREEN.slots[id === me ? 'me' : 'opp'][0];
      return [spot[0], spot[1]];
    };
    const say = (text: string, tone: Note['tone'], ms: number, at2: [number, number] = [50, 50]) =>
      at(ms, () => setNote({ id: nextId(), text, tone, x: at2[0], y: at2[1] }));
    if (ev.swapped)
      setAnim({
        board,
        flash: new Set(),
        key,
        swap: ev.a !== undefined && ev.b !== undefined ? [ev.a, ev.b] : undefined,
      });
    t += SWAP_MS;
    // The move is spent (its diamond goes out) once the swap is done.
    at(t, () => setMovesShown(Math.max(0, movesStart.current - 1)));
    if (ev.kind === 'boost' && ev.slot !== undefined) {
      const key = `${ev.by}-${ev.slot}`;
      const boosted = mover?.monsters[ev.slot]?.element;
      at(t, () =>
        setManaShown((m) =>
          m && boosted
            ? { ...m, [key]: Math.min(MONSTERS[boosted].cost, (m[key] ?? 0) + boostMana(stage)) }
            : m,
        ),
      );
    }
    if (ev.kind === 'evolve' && ev.slot !== undefined) {
      const slot = ev.slot;
      const evolvedNow = mover?.monsters[slot]?.element;
      // Charge up (glow, shake, rising notes), then the new form pops out in a flash.
      at(t, () => setEvolve({ owner: ev.by, slot, phase: 'charge' }));
      for (let n = 0; n < 5; n++) at(t + n * 200, () => chainSound(n));
      const petPos = boardPct(...petAt(ev.by, slot));
      say(`${evolvedNow ? MONSTERS[evolvedNow].names[0] : 'Your pet'} is evolving...`, 'info', t, [
        Math.max(24, Math.min(76, petPos[0])),
        petPos[1] - 55,
      ]);
      at(t + EVOLVE_MS * 0.55, () => {
        setEvolve({ owner: ev.by, slot, phase: 'pop' });
        play('win');
        haptic('success');
        if (evolvedNow)
          setNote({
            id: nextId(),
            text: `${MONSTERS[evolvedNow].names[1]}!`,
            tone: 'good',
            x: Math.max(24, Math.min(76, petPos[0])),
            y: petPos[1] - 55,
          });
      });
      at(t + EVOLVE_MS, () => setEvolve(null));
      t += EVOLVE_MS;
    }
    // The hit points race up or down to their new value, casino style, with a rising tick.
    const countHp = (id: string, by: number, ms: number, tone: 'dmg' | 'heal' = 'dmg') => {
      const from = hpShownRef.current?.[id];
      if (from === undefined) return;
      const to = Math.max(0, Math.min(hpMax[id] ?? from + by, from + by));
      const start = performance.now();
      let n = 0;
      setHpCounting({ owner: id, tone });
      const iv = setInterval(() => {
        const u = Math.min(1, (performance.now() - start) / ms);
        const value = Math.round(from + (to - from) * (1 - (1 - u) * (1 - u)));
        setHpShown((h) => (h ? { ...h, [id]: value } : h));
        tick(n++);
        if (u >= 1) {
          clearInterval(iv);
          timers.push(setTimeout(() => setHpCounting(null), 350));
        }
      }, 45);
      timers.push(iv as unknown as ReturnType<typeof setTimeout>);
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
        // The attack flies at the opponent's hit points (top of the screen), not at a pet.
        const [tx, ty] = HP_SPOT[target === me ? 'me' : 'opp'];
        const fx$: AttackFx = {
          id: nextId(),
          element: f.element,
          from: [fx, fy - 12],
          group: {
            cx: (x0 + x1) / 2,
            cy: (y0 + y1) / 2,
            rx: (x1 - x0) / 2 + 7,
            ry: (y1 - y0) / 2 + 8,
          },
          to: [tx, ty],
        };
        // 1. A short pause (the +n totals over the bars are seen), then the attack flies.
        at(t + ATTACK.lead, () => {
          setAtk(fx$);
          const key = `${f.owner}-${f.slot}`;
          setManaShown((m) => (m ? { ...m, [key]: 0 } : m));
        });
        // 2. It lands on the hit points: they flash, a red number pops up over them (Yatzy style), tips over and
        //    falls into the total, which counts down.
        at(t + ATTACK.lead + ATTACK.hit, () => {
          play('boom');
          setHpHit({ owner: target });
          setPops((p) => [
            ...p,
            {
              id: nextId(),
              x: Math.min(tx, 112),
              y: ty + 7,
              text: `-${f.damage}`,
              tone: 'dmg',
            },
          ]);
        });
        // (the number lands in the total after ~800 ms; only then do the hit points count down)
        at(t + ATTACK.lead + ATTACK.hit + 800, () => countHp(target, -f.damage, 560));
        // 3. Then the pet's special ability: said out loud, healing / draining shown, tiles change next.
        at(t + ATTACK.lead + ATTACK.hit + 1450, () => {
          // (said above the pet that attacked)
          const from = boardPct(fx, fy - 30);
          setNote({
            id: nextId(),
            text: MONSTERS[f.element].effect[f.evolved ? 1 : 0],
            tone: 'info',
            x: Math.max(24, Math.min(76, from[0])),
            y: from[1],
          });
          if (f.drain) {
            const drain = f.drain;
            setManaShown((m) => {
              if (!m) return m;
              const next = { ...m };
              for (let n = 0; n < 2; n++) {
                const key = `${target}-${n}`;
                if (key in next) next[key] = Math.max(0, (next[key] ?? 0) - drain);
              }
              return next;
            });
          }
          // Healing is the reverse of damage: the total counts up, in green.
          if (f.heal > 0) countHp(f.owner, f.heal, 560, 'heal');
          setPops((p) => [
            ...p,
            ...(f.heal > 0
              ? [
                  {
                    id: nextId(),
                    x: Math.min(HP_SPOT[f.owner === me ? 'me' : 'opp'][0], 112),
                    y: HP_SPOT[f.owner === me ? 'me' : 'opp'][1] + 7,
                    text: `+${f.heal}`,
                    tone: 'heal' as const,
                  },
                ]
              : []),
            // The drain takes mana from both of the opponent's pets: a number over each.
            ...(f.drain
              ? SCREEN.slots[target === me ? 'me' : 'opp'].map(([sx, sy]) => ({
                  id: nextId(),
                  x: sx,
                  y: sy + 8,
                  text: `-${f.drain} mana`,
                }))
              : []),
          ]);
        });
        at(t + ATTACK.lead + ATTACK.hit + 450, () => setHpHit(null));
        at(t + FIRE_MS, () => setAtk(null));
        t += FIRE_MS;
      }
    };
    ev.steps.forEach((step, i) => {
      fireAt(i);
      const before = board;
      const cleared = step.cleared;
      // Tiles that fill one of the mover's bars (or the berries) fly there and count up, like Yatzy dice.
      const groups = new Map<
        string,
        { target: string; cells: number[]; src: string; manaKey?: string; manaCost?: number }
      >();
      if (!step.bomb && !reducedMotion()) {
        for (const [idx, cell] of cleared.entries()) {
          const found = before[cell];
          if (!found) continue;
          // (A tile hidden by the Swamp is a "?" on the board, but the step says what it really was.)
          const tile = { ...found, k: (step.kinds?.[idx] ?? found.k) as typeof found.k };
          let target: string | null = null;
          let manaKey: string | undefined;
          let manaCost: number | undefined;
          if (tile.k === 'berry') target = `mates-berries-${who}`;
          else {
            const slot = mover?.monsters.findIndex((m) => m.element === tile.k) ?? -1;
            if (slot >= 0) target = `mates-mana-${who}-${slot}`;
            if (slot >= 0) manaKey = `${ev.by}-${slot}`;
            if (slot >= 0) manaCost = MONSTERS[tile.k as matchmates.Element].cost;
          }
          if (!target) continue;
          const g = groups.get(target) ?? {
            target,
            cells: [],
            src: tileUrl(tile),
            manaKey,
            manaCost,
          };
          g.cells.push(cell);
          groups.set(target, g);
        }
      }
      // Each tile that lands in a mana bar fills it by one (shown when it arrives, not when the move did).
      for (const g of groups.values()) {
        const key = g.manaKey;
        if (!key) continue;
        const stagger = Math.max(25, Math.min(110, FLY_SPREAD_MS / g.cells.length));
        g.cells.forEach((_, n) =>
          at(t + n * stagger + FLY_MS, () =>
            setManaShown((m) =>
              m ? { ...m, [key]: Math.min(g.manaCost ?? 99, (m[key] ?? 0) + 1) } : m,
            ),
          ),
        );
      }
      if (step.bomb) {
        const bombs = cleared.filter((cell) => before[cell]?.k === 'bomb');
        const items = cleared.map((cell) => {
          const dist = Math.min(
            ...(bombs.length ? bombs : [cell]).map(
              (b) =>
                Math.abs(Math.floor(b / COLS) - Math.floor(cell / COLS)) +
                Math.abs((b % COLS) - (cell % COLS)),
            ),
          );
          return { id: nextId(), cell, delay: dist * 45 };
        });
        {
          const [bx, by] = cellsPct(bombs.length ? bombs : cleared);
          say('BOOM!', 'bad', t, [bx, Math.max(6, by - 14)]);
        }
        at(t, () => {
          setBlasts(items);
          play('boom');
          haptic('success');
        });
        at(t + STEP_MS, () => setBlasts([]));
      }
      if (step.pulled?.length) {
        // Laboratory: a charged tile went and took two more with it.
        const [px_, py_] = cellsPct(step.pulled);
        say(`Charged! +${step.pulled.length} tiles`, 'good', t, [px_, Math.min(92, py_ + 16)]);
      }
      // The artist's glow bursts round the cleared tiles, in the colour of their kind.
      if (cleared.length > 0 && !step.bomb) {
        const items = cleared.map((cell, idx) => ({
          cell,
          kind: step.pulled?.includes(cell)
            ? 'electric'
            : (step.kinds?.[idx] ?? before[cell]?.k ?? 'gold'),
        }));
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
              id: nextId(),
              src: g.src,
              x: from.x,
              y: from.y,
              dx: to.x - from.x,
              dy: to.y - from.y,
              size: 28,
              delay: n * stagger,
            });
            // A rising tick as each tile lands.
            at(t + n * stagger + FLY_MS, () => tick(n));
          });
          // The total (+3) shows at once, the moment the tiles start to fly, and goes away quickly.
          const tally = { key: g.target + i, x: to.x, y: to.y, n: g.cells.length };
          setTallies((all) => [...all.filter((x) => x.key !== tally.key), tally]);
          at(t + TALLY_MS, () => setTallies((all) => all.filter((x) => x !== tally)));
        }
        setFlights((all) => [...all, ...flying]);
        setAnim({ board: before, flash: new Set(cleared), key, flown });
        chainSound(i);
        if (i >= 1) {
          const [cx_, cy_] = cellsPct(cleared);
          setCombo({ id: ev.seq * 100 + i, level: i + 1, x: cx_, y: Math.max(8, cy_ - 12) });
        }
        if (i >= 1)
          setSparks((sp) => [
            ...sp,
            ...cleared.slice(0, 14).map((cell) => ({
              id: nextId(),
              cell,
              emoji: i >= 2 ? '🪙' : '✨',
              dx: Math.round((Math.random() - 0.5) * 120),
            })),
          ]);
      });
      // Tiles that only change (Water's special turns some blue): they flicker current -> blue -> current -> blue,
      // each switch with a flash of water glow, and the last blue stays.
      const morphing = (step.changed?.length ?? 0) > 0 && cleared.length === 0;
      if (morphing) {
        const cells = step.changed ?? [];
        [250, 500, 750].forEach((ms, n) => {
          at(t + ms, () => {
            setAnim({ board: n % 2 === 0 ? step.board : before, flash: new Set(), key: ++key });
            tick(n + 2);
          });
          for (let f = 0; f < 6; f++)
            at(t + ms + f * 40, () =>
              setGlow({ items: cells.map((cell) => ({ cell, kind: 'water' })), frame: f }),
            );
        });
        at(t + 750 + 6 * 40, () => setGlow(null));
      } else
        at(t + (cleared.length > 0 ? FLASH_MS : 0), () =>
          setAnim({
            board: step.board,
            flash: new Set(),
            drops: cleared.length > 0 ? dropsFor(cleared) : undefined,
            key: ++key,
          }),
        );
      board = step.board;
      t += morphing ? CHANGE_MS : STEP_MS;
    });
    fireAt(ev.steps.length);
    at(t, () => {
      setAnim(null);
      setAtk(null);
      setHpHit(null);
      setGlow(null);
      setBlasts([]);
      setFlights([]);
    });
    if (ev.win) {
      // The finale: the losing pets faint (with a falling sound), the winners walk to the middle, then the whole
      // board falls away, bottom row first.
      at(t + FAINT_AT, () => {
        setFinale('faint');
        play('faint');
        haptic('error');
      });
      at(t + WIN_AT, () => {
        setFinale('win');
        play('win');
        haptic('success');
      });
      at(t + DROP_AT, () => setDropping(true));
      for (let r = 0; r < ROWS; r++) at(t + DROP_AT + r * END_ROW_MS, () => play('deal'));
    }
    // What the move earned besides damage: said out loud, with a pop on the hit points.
    if (ev.heal > 0) {
      const hp = HP_SPOT[who];
      say(
        `Match of ${ev.longest}: +${ev.heal} HP!`,
        'good',
        t,
        boardPct(Math.max(38, Math.min(102, hp[0])), hp[1] + 17),
      );
      at(t, () => {
        play('score');
        countHp(ev.by, ev.heal, 560, 'heal');
        const [hx, hy] = HP_SPOT[ev.by === me ? 'me' : 'opp'];
        setPops((p) => [
          ...p,
          {
            id: nextId(),
            x: Math.min(hx, 112),
            y: hy + 7,
            text: `+${ev.heal}`,
            tone: 'heal',
          },
        ]);
      });
      t += NOTE_MS;
    }
    if (ev.extraMove) {
      // The extra move: a +1 and a new diamond that rises from the bottom.
      at(t, () => {
        play('turn');
        setMovesShown((m) => (m ?? 0) + 1);
        setBonus(nextId());
      });
      at(t, () => play('turn'));
      t += NOTE_MS;
    }
    at(t + 700, () => {
      setReplaying(false);
      setMovesShown(null);
      setBonus(null);
      setHpCounting(null);
      setHpShown(null);
      setManaShown(null);
      setPops([]);
      setCombo(null);
      setSparks([]);
      setNote(null);
    });
    return () => {
      timers.forEach(clearTimeout);
      setAnim(null);
      setAtk(null);
      setHpHit(null);
      setGlow(null);
      setBlasts([]);
      setCombo(null);
      setSparks([]);
      setFlights([]);
      setTallies([]);
      setNote(null);
      setEvolve(null);
      // (replaying / hpShown / manaShown are NOT reset here: this cleanup runs after the layout effect of the
      // next move has set them, and would wipe them, so the numbers would jump to their final values at once.
      // The end of a replay resets them itself.)
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

  // The intro after the coin flip: the arena fades in, the pets spawn one by one, the hit points count up from 0 and
  // the tiles drop in row by row. The board cannot be touched until it is over.
  const [intro, setIntro] = useState(false);
  const wasCoin = useRef(coin);
  useEffect(() => {
    const ended = wasCoin.current && !coin;
    wasCoin.current = coin;
    if (!ended || reducedMotion() || view.phase !== 'play' || view.moveCount > 0) return;
    setIntro(true);
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Hit points: 0 first, then they race up to the full amount with ticks.
    setHpShown(Object.fromEntries(view.players.map((p) => [p.id, 0])));
    timers.push(
      setTimeout(() => {
        const start = performance.now();
        let n = 0;
        const iv = setInterval(() => {
          const u = Math.min(1, (performance.now() - start) / 1100);
          setHpShown(
            Object.fromEntries(
              view.players.map((p) => [p.id, Math.round(p.maxHp * (1 - (1 - u) * (1 - u)))]),
            ),
          );
          tick(n++);
          if (u >= 1) clearInterval(iv);
        }, 45);
        timers.push(iv as unknown as ReturnType<typeof setTimeout>);
      }, 700),
    );
    // A chime for each pet that spawns, a whoosh for each row of tiles.
    for (let i = 0; i < 4; i++)
      timers.push(setTimeout(() => chainSound(i), INTRO_PET_AT + i * INTRO_PET_STEP));
    for (let r = 0; r < ROWS; r++)
      timers.push(setTimeout(() => play('deal'), INTRO_TILES_AT + (ROWS - 1 - r) * INTRO_ROW_MS));
    timers.push(
      setTimeout(() => {
        setIntro(false);
        setHpShown(null);
      }, matchmates.INTRO_MS),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin]);

  const animating = anim !== null;
  // "Your turn!" in the middle of the screen when the turn comes to me (after the last move has played out).
  const [turnBanner, setTurnBanner] = useState(0);
  // (starts false: the very first turn is announced too, after the coin flip)
  const wasMine = useRef(false);
  const settled = !animating && !coin && !intro && flights.length === 0 && !replaying;
  useEffect(() => {
    if (!myTurn) wasMine.current = false;
    else if (!wasMine.current && settled) {
      wasMine.current = true;
      if (reducedMotion()) return;
      play('turn');
      haptic('tap');
      setTurnBanner((n) => n + 1);
    }
  }, [myTurn, settled, view.moveCount]);
  // The banner goes away by itself (its own timer, so a re-run of the effect above cannot leave it on screen).
  useEffect(() => {
    if (turnBanner === 0) return;
    const t = setTimeout(() => setTurnBanner(0), 1300);
    return () => clearTimeout(t);
  }, [turnBanner]);
  const board = anim?.board ?? view.board;
  const canAct = myTurn && !busy && !animating && !replaying && !intro && !coin;
  // A tile picked for a swap is let go when the turn is gone (timeout) or the next move is replaying.
  useEffect(() => {
    if (!myTurn || replaying) setSelected(null);
  }, [myTurn, replaying]);
  // Whose turn the screen shows: the mover's until the animation of the last move is over.
  const visualTurn = replaying && view.lastEvent ? view.lastEvent.by : view.turn;
  const showTurn = (id: string) => view.phase === 'play' && !finished && visualTurn === id;

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

  // Tapping one of my pets: its pop-up with both forms and the Evolve / Boost button (berries as a loading bar).
  // The screen of the game: every text that says something is kept inside it (FitText).
  const stageRef = useRef<HTMLDivElement>(null);
  const petInfo = usePetInfo((element) => {
    const slot = mine.monsters.findIndex((m) => m.element === element);
    const pet = mine.monsters[slot];
    if (!pet) return null;
    return {
      berries: mine.berries,
      need: evolveCost(stage),
      canAct,
      evolved: pet.evolved,
      color: ELEMENT_COLOR[element],
      run: () => void send({ type: pet.evolved ? 'boost' : 'evolve', slot }),
    };
  });

  // A pet pop-up does not stay open into the next turn.
  useEffect(() => {
    petInfo.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.turn, view.phase]);

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

  const W = SCREEN.w;
  const H = SCREEN.h;
  /** Art pixels that show: the width minus the cropped side margins. */
  const VISIBLE_W = W - 2 * SCREEN.cropX;
  /** A box in screen art pixels as % of the stage (the whole screen is laid out in art pixels, like the reference). */
  const at = (x: number, y: number, w?: number, h?: number) => ({
    left: `${(x / W) * 100}%`,
    top: `${((y - SCREEN.top) / H) * 100}%`,
    ...(w !== undefined ? { width: `${(w / W) * 100}%` } : {}),
    ...(h !== undefined ? { height: `${(h / H) * 100}%` } : {}),
  });
  const cq = (artPx: number) => `${(artPx / VISIBLE_W) * 100}cqw`;
  const hudText = {
    fontSize: cq(7.5),
    lineHeight: 1,
    textShadow: '0 1px 0 #101628, 0 0 2px #101628',
  } as const;

  const hudSide = (p: matchmates.MatePlayer, who: 'me' | 'opp') => {
    const member = memberOf(p.id);
    const movesNow = movesShown ?? view.movesLeft;
    const turn = showTurn(p.id);
    const hpColor =
      hpCounting?.owner === p.id && hpCounting.tone === 'heal'
        ? '#5dde7a'
        : hpHit?.owner === p.id || hpCounting?.owner === p.id
          ? '#ff4d4d'
          : turn
            ? '#101628'
            : '#ffffff';
    // On the yellow box (this player's turn) the numbers are dark; otherwise white with a dark outline.
    const shadow = turn ? '0 1px 0 rgba(255,255,255,.5)' : hudText.textShadow;
    // Berries and hit points, one under the other.
    const stack = (
      <div className="flex flex-col" style={{ gap: cq(1.6), paddingTop: cq(1.5) }}>
        <div className="flex items-center" style={{ gap: cq(1.6) }}>
          <img
            src={hudUrl('berry')}
            alt="Berries"
            draggable={false}
            style={{ ...px, width: cq(9) }}
          />
          <span
            className="font-black"
            style={{ ...hudText, color: turn ? '#101628' : '#ffffff', textShadow: shadow }}
            data-testid={`mates-berries-${who}`}
          >
            {p.berries}/{evolveCost(stage)}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: cq(1.6) }}>
          <img
            src={hudUrl('heart')}
            alt="Hit points"
            draggable={false}
            style={{ ...px, width: cq(9) }}
          />
          <span
            className="font-black"
            style={{
              ...hudText,
              color: hpColor,
              fontWeight: 900,
              textShadow:
                hpCounting?.owner === p.id
                  ? '0 1px 0 #101628, 1px 0 0 #101628, 0 0 2px #101628, 0.4px 0 0 currentColor'
                  : shadow,
              transform: hpCounting?.owner === p.id ? 'scale(1.35)' : undefined,
              transformOrigin: 'left center',
              transition: 'transform 120ms ease-out',
              animation: hpHit?.owner === p.id ? 'mates-hit 450ms linear' : undefined,
            }}
            data-testid={`mates-hp-${who}`}
            title={`${hpShown?.[p.id] ?? p.hp}/${p.maxHp} HP`}
          >
            {hpShown?.[p.id] ?? p.hp}
          </span>
        </div>
      </div>
    );
    // One box round the berries, hit points, picture and the moves left (boots); it turns fully yellow on this
    // player's turn.
    const box = (
      <div
        className="relative shrink-0 rounded-md border-2 transition-colors"
        data-testid={`mates-box-${who}`}
        data-turn={turn}
        style={{
          width: cq(62),
          height: cq(42),
          borderColor: turn ? '#fda200' : 'rgba(137,154,209,.35)',
          // On the player's turn the whole box is yellow, not only its border.
          background: turn ? '#fda200' : 'rgba(16,22,40,.35)',
        }}
      >
        <div
          className="absolute flex items-start"
          style={{
            left: cq(3),
            right: cq(3),
            top: cq(1.2),
            gap: cq(3),
            flexDirection: who === 'me' ? 'row' : 'row-reverse',
            justifyContent: 'center',
          }}
        >
          {stack}
          <Avatar
            avatar={member?.avatar ?? '🙂'}
            size="fluid"
            className="h-[18.6cqw] w-[18.6cqw] shrink-0 text-[11cqw] !border-transparent"
          />
        </div>
        {turn && (
          <span
            className="absolute inset-x-0 flex items-center justify-center"
            data-testid="mates-moves"
            aria-label={`${movesNow} moves left`}
            style={{ bottom: cq(1.4), gap: cq(movesNow > 3 ? 1.6 : 3) }}
          >
            {Array.from({ length: Math.max(2, movesNow) }, (_, n) => (
              <img
                key={n}
                src={hudUrl(n < movesNow ? 'bone-full' : 'bone-empty')}
                alt=""
                draggable={false}
                style={{
                  ...px,
                  width: cq(movesNow > 3 ? 7.4 : 9.6),
                  animation:
                    bonus !== null && n === movesNow - 1
                      ? 'mates-boot-up 600ms cubic-bezier(.2,.9,.3,1.2) both'
                      : undefined,
                }}
              />
            ))}
            {bonus !== null && (
              <span
                key={bonus}
                aria-hidden
                className="absolute left-1/2 font-black text-green-700"
                style={{
                  bottom: '60%',
                  fontSize: cq(6),
                  textShadow: '0 1px 0 rgba(255,255,255,.6)',
                  animation: 'mates-plus1 1100ms ease-out forwards',
                }}
              >
                +1
              </span>
            )}
          </span>
        )}
      </div>
    );
    // Each side is one half of the screen: the name is centred in it (at 25 % / 75 % of the width), at most
    // half the width of the screen, and a long one wraps to a second line that pushes the rest down.
    return (
      <div
        data-testid={who === 'me' ? 'mates-me' : 'mates-opp'}
        className="absolute flex flex-col items-center"
        style={{
          left: who === 'me' ? 0 : '50%',
          width: '50%',
          top: `${(1.5 / H) * 100}%`,
          gap: cq(1.2),
        }}
      >
        <div
          className="text-center font-black uppercase text-white"
          style={{
            maxWidth: '94%',
            fontSize: cq(5),
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
            textShadow: hudText.textShadow,
          }}
        >
          <PlayerName name={p.id === me ? 'You' : (member?.nickname ?? 'Opponent')} />
        </div>
        <div className="flex items-start justify-center" style={{ width: '100%' }}>
          {box}
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative z-10 flex h-full min-h-0 flex-col items-center gap-1.5 pb-1 pt-1"
      data-testid="mates-game"
      data-phase={view.phase}
    >
      {/* The arena fills the whole screen: sky colour above it, ground colour below. */}
      <div
        aria-hidden
        data-testid="mates-backdrop"
        className="fixed inset-0 -z-10"
        style={{
          background: edges
            ? `linear-gradient(to bottom, ${edges.top} 0%, ${edges.top} 30%, ${edges.bottom} 70%, ${edges.bottom} 100%)`
            : '#101628',
        }}
      />
      <style>{`
        @keyframes mates-lunge { 0%{transform:translateX(0)} 40%{transform:translateX(var(--lunge))} 100%{transform:translateX(0)} }
        @keyframes mates-dmg { 0%{opacity:0;transform:translateX(-50%) translateY(10px) scale(.5)} 18%{opacity:1;transform:translateX(-50%) translateY(8px) scale(1.6)} 50%{opacity:1;transform:translateX(-50%) translateY(8px) scale(1.6) rotate(-45deg)} 85%{opacity:1;transform:translateX(-50%) translateY(-6px) scale(.8) rotate(0)} 100%{opacity:0;transform:translateX(-50%) translateY(-10px) scale(.4)} }
        @keyframes mates-sparkle { 0%{transform:translateY(0);opacity:0} 10%{opacity:1} 80%{opacity:1} 100%{transform:translateY(-310%);opacity:0} }
        @keyframes mates-heal { 0%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.4)} 25%{opacity:1;transform:translateX(-50%) translateY(2px) scale(1.4)} 60%{opacity:1;transform:translateX(-50%) translateY(10px) scale(1.6)} 100%{opacity:0;transform:translateX(-50%) translateY(16px) scale(1.2)} }
        @keyframes mates-boot-up { 0%{opacity:0;transform:translateY(300%)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes mates-plus1 { 0%{opacity:0;transform:translateX(-50%) translateY(8px) scale(.6)} 30%{opacity:1;transform:translateX(-50%) translateY(-4px) scale(1.5)} 100%{opacity:0;transform:translateX(-50%) translateY(-16px) scale(1)} }
        @keyframes mates-drop-away { 0%{transform:translateY(0) rotate(0deg);opacity:1} 16%{transform:translateY(-9%) rotate(calc(var(--tilt) * -.35))} 100%{transform:translateY(560%) rotate(calc(var(--tilt) * 3));opacity:0} }
        @keyframes mates-intro-fade { 0%{opacity:0} 100%{opacity:1} }
        @keyframes mates-spawn { 0%{opacity:0;transform:scale(0);filter:brightness(6)} 55%{opacity:1;transform:scale(1.28);filter:brightness(2.2)} 80%{transform:scale(.94);filter:brightness(1.2)} 100%{transform:scale(1);filter:none} }
        @keyframes mates-tile-in { 0%{opacity:0;transform:translateY(-650%)} 25%{opacity:1} 100%{opacity:1;transform:translateY(0)} }
        @keyframes mates-faint { 0%{transform:translateY(0) scale(1);opacity:1;filter:none} 12%{transform:translateY(-3%) scale(1.04);filter:brightness(2.4)} 30%{transform:translateY(4%) scale(1);filter:brightness(1)} 100%{transform:translateY(95%) scaleY(.2);opacity:0;filter:brightness(.4)} }
        @keyframes mates-win-walk { 0%{transform:translate(0,0)} 22%{transform:translate(calc(var(--dx) * .25), calc(var(--dy) * .25 - 16%))} 44%{transform:translate(calc(var(--dx) * .5), calc(var(--dy) * .5))} 66%{transform:translate(calc(var(--dx) * .75), calc(var(--dy) * .75 - 16%))} 85%{transform:translate(var(--dx), var(--dy))} 92%{transform:translate(var(--dx), calc(var(--dy) - 12%))} 100%{transform:translate(var(--dx), var(--dy))} }
        @keyframes mates-pop { 0%{opacity:0;transform:translateY(0) scale(.6)} 20%{opacity:1;transform:translateY(-6px) scale(1.2)} 100%{opacity:0;transform:translateY(-28px) scale(1)} }
        @keyframes mates-flash { 0%{transform:scale(1);filter:none} 45%{transform:scale(1.25);filter:brightness(2.4)} 100%{transform:scale(0);opacity:0} }
        @keyframes mates-fall { 0%{transform:translateY(calc(var(--drop) * -100%))} 68%{transform:translateY(0)} 82%{transform:translateY(-7%)} 100%{transform:translateY(0)} }
        @keyframes mates-spark { 0%{opacity:1;transform:translate(0,0) scale(.6)} 100%{opacity:0;transform:translate(var(--dx),70px) scale(1.1)} }
        @keyframes mates-combo { 0%{opacity:0;transform:scale(.4) rotate(-6deg)} 25%{opacity:1;transform:scale(1.25) rotate(3deg)} 100%{opacity:0;transform:scale(1) translateY(-30px)} }
        @keyframes mates-turn { 0%{opacity:0;transform:scale(.3) rotate(-8deg)} 20%{opacity:1;transform:scale(1.25) rotate(3deg)} 35%{transform:scale(1) rotate(0)} 80%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(1.4)} }
        @keyframes mates-slide { 0%{transform:translate(calc(var(--sx) * (100% + 2px)), calc(var(--sy) * (100% + 2px))) scale(1.12)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes mates-fly { 0%{opacity:1;transform:translate(0,0) scale(1.1)} 90%{opacity:1} 100%{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.45)} }
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
        className="relative min-h-0 w-full flex-1 overflow-hidden"
        style={{
          containerType: 'inline-size',
          // Behind the coin nothing of the arena shows; after it the arena fades in.
          opacity: coin ? 0 : 1,
          animation: intro ? 'mates-intro-fade 500ms ease-out both' : undefined,
        }}
        ref={stageRef}
        data-testid="mates-arena"
      >
        {/* The art is 140 px wide; a few pixels are cropped off each side so the borders are slim. */}
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${(-SCREEN.cropX / VISIBLE_W) * 100}%`,
            width: `${(W / VISIBLE_W) * 100}%`,
          }}
        >
          <img
            src={portraitUrl(stage, STAGE_SPECS)}
            alt={STAGE_SPECS[stage].name}
            draggable={false}
            style={{ ...px, objectFit: 'fill' }}
            className="absolute inset-0 h-full w-full"
          />

          {/* HUD: back, berries + hit points and the picture of each player, the menu. */}
          {hudSide(mine, 'me')}
          {hudSide(theirs, 'opp')}
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
              const color = ELEMENT_COLOR[m.element];
              const mana = manaShown?.[`${p.id}-${slot}`] ?? m.mana;
              // The finale: the losers faint, the winners walk to the middle of the arena (a hop at every step).
              const isWinner = view.winner === p.id;
              const finaleOn = finale !== 'none';
              const instant = finale === 'done';
              const target: [number, number] | null = isWinner ? [56 + slot * 28, 148] : null;
              const finaleStyle =
                isWinner && finaleOn && target
                  ? ({
                      ['--dx' as string]: `${((target[0] - fx) / w) * 100}%`,
                      ['--dy' as string]: `${((target[1] - fy) / h) * 100}%`,
                    } as React.CSSProperties)
                  : {};
              const finaleAnimation = !finaleOn
                ? null
                : isWinner
                  ? finale === 'faint'
                    ? null
                    : `mates-win-walk ${instant ? 0 : WIN_MS}ms cubic-bezier(.3,0,.2,1) forwards`
                  : `mates-faint ${instant ? 0 : FAINT_MS}ms cubic-bezier(.5,0,.8,.6) forwards`;
              return (
                <div key={`${p.id}-${slot}`}>
                  <div
                    className="absolute cursor-pointer"
                    style={{
                      ...at(fx - w / 2, fy - h, w),
                      transformOrigin: '50% 100%',
                      ...finaleStyle,
                      animation:
                        finaleAnimation ??
                        (intro
                          ? `mates-spawn 620ms cubic-bezier(.2,1.5,.4,1) ${INTRO_PET_AT + ((who === 'opp' ? 0 : 2) + slot) * INTRO_PET_STEP}ms backwards`
                          : undefined),
                    }}
                    onClick={(e) => petInfo.open(e, m.element, shownEvolved)}
                    data-testid={`mates-monster-${who}-${slot}`}
                  >
                    {/* Berries are full (mine or the opponent's): pixel sparkles rise round the pets that can evolve / boost. */}
                    {p.berries >= evolveCost(stage) && !evolving && (
                      <span
                        aria-hidden
                        data-testid="mates-ready-glow"
                        className="pointer-events-none"
                      >
                        {READY_SPARKLES.map(([dx, delay], n) => (
                          <img
                            key={n}
                            src={readySparkleUrl(m.element)}
                            alt=""
                            draggable={false}
                            className="absolute"
                            style={{
                              ...px,
                              left: `${50 + dx}%`,
                              bottom: '0%',
                              width: `${(7 / w) * 100}%`,
                              animation: `mates-sparkle 1800ms steps(9) ${delay}ms infinite backwards`,
                            }}
                          />
                        ))}
                      </span>
                    )}
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
                    style={{
                      ...at(fx - 18, fy + 1, 36),
                      opacity: finale !== 'none' ? 0 : undefined,
                      transition: 'opacity 300ms',
                      animation: intro
                        ? `mates-intro-fade 400ms ease-out ${INTRO_PET_AT + 300 + ((who === 'opp' ? 0 : 2) + slot) * INTRO_PET_STEP}ms backwards`
                        : undefined,
                    }}
                    title={`${spec.names[shownEvolved ? 1 : 0]}: ${mana}/${spec.cost} mana`}
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
                        width: `${(24 / 36) * 100 * Math.min(1, mana / spec.cost)}%`,
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
                      {Math.min(mana, spec.cost)}/{spec.cost}
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
              ...at(SCREEN.boardX, SCREEN.boardY, COLS * SCREEN.cell),
              aspectRatio: `${COLS * SCREEN.cell} / ${ROWS * SCREEN.cell}`,
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
                    style={
                      intro
                        ? ({
                            animation: `mates-tile-in 650ms cubic-bezier(.3,.1,.4,1.25) ${
                              INTRO_TILES_AT +
                              (ROWS - 1 - Math.floor(i / COLS)) * INTRO_ROW_MS +
                              (i % COLS) * 30
                            }ms backwards`,
                          } as React.CSSProperties)
                        : dropping
                          ? ({
                              ['--tilt' as string]: `${((i * 37) % 25) - 12}deg`,
                              animation: `mates-drop-away ${END_FALL_MS}ms cubic-bezier(.5,0,.85,.45) ${
                                (ROWS - 1 - Math.floor(i / COLS)) * END_ROW_MS + (i % 3) * 35
                              }ms both`,
                            } as React.CSSProperties)
                          : undefined
                    }
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
                    {cell.charged && !flownAway && (
                      <img
                        src={chargedUrl()}
                        alt=""
                        draggable={false}
                        data-testid="charged-tile"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        style={px}
                      />
                    )}
                    {cell.k === 'berry' && !flownAway && (
                      <img
                        src={berryShineUrl()}
                        alt=""
                        draggable={false}
                        data-testid="berry-shine"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        style={px}
                      />
                    )}
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
              {blasts.map((b) => (
                <Blast
                  key={b.id}
                  delay={b.delay}
                  style={{
                    left: `${(((b.cell % COLS) + 0.5) / COLS) * 100}%`,
                    top: `${((Math.floor(b.cell / COLS) + 0.5) / ROWS) * 100}%`,
                    width: `${(32 / (COLS * SCREEN.cell)) * 100}%`,
                    transform: 'translate(-50%, -50%)',
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
                <FitText
                  key={note.id}
                  x={note.x}
                  y={note.y}
                  bounds={stageRef}
                  testId="mates-note"
                  className={`font-black [text-shadow:0_3px_0_#101628,0_0_12px_#000] ${
                    note.tone === 'bad'
                      ? 'text-red-300'
                      : note.tone === 'good'
                        ? 'text-green-300'
                        : 'text-yellow-200'
                  }`}
                  style={{
                    fontSize: '5.2cqw',
                    animation: `mates-note ${NOTE_MS + 200}ms ease-out forwards`,
                  }}
                >
                  {note.text}
                </FitText>
              )}
              {combo && (
                <FitText
                  key={combo.id}
                  x={combo.x}
                  y={combo.y}
                  bounds={stageRef}
                  testId="mates-combo"
                  className="whitespace-nowrap font-black text-yellow-300 [text-shadow:0_3px_0_#101628,0_0_14px_#ff9d00]"
                  style={{
                    fontSize: `${Math.min(9, 4.5 + combo.level * 0.8)}cqw`,
                    animation: 'mates-combo 900ms ease-out forwards',
                  }}
                >
                  CHAIN x{combo.level}!
                </FitText>
              )}
            </div>
          </div>
          {/* Not my turn: the field is dimmed to half brightness. */}
          <div
            aria-hidden
            data-testid="mates-dim"
            data-on={!showTurn(me) && !finished}
            className="pointer-events-none absolute bg-black/50 transition-opacity duration-300"
            style={{
              ...at(SCREEN.panel.x, SCREEN.panel.y, SCREEN.panel.w),
              aspectRatio: `${SCREEN.panel.w} / ${SCREEN.panel.h}`,
              opacity: !showTurn(me) && !finished ? 1 : 0,
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
                animation:
                  p.tone === 'dmg'
                    ? 'mates-dmg 1000ms ease-in-out forwards'
                    : p.tone === 'heal'
                      ? 'mates-heal 1000ms ease-in-out forwards'
                      : 'mates-pop 900ms ease-out forwards',
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
                animation: `mates-tally-away 350ms ease-in ${TALLY_MS - 350}ms both`,
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
