import { z } from 'zod';
import type {
  AutoMove,
  GameDefinition,
  GamePlayer,
  GameResults,
  MoveValidation,
  PlayerId,
} from '../../game/types';
import { createSeededRng } from '../../game/rng';
import type { Rng } from '../../game/rng';
import {
  createBoard,
  dropAndRefill,
  findMatches,
  legalSwaps,
  trySwap,
  adjacent,
  cellAt,
} from './board';
import { BERRIES_TO_EVOLVE, BOOST_MANA, MONSTERS, evolveCost } from './monsters';
import { CELLS, COLS, ELEMENTS, MAX_PLAYERS, MIN_PLAYERS, ROWS, STAGES } from './types';
import type {
  Element,
  MateCell,
  MateEvent,
  MateFire,
  MateMonster,
  MatePlayer,
  MateStep,
  MatesMove,
  MatesOptions,
  MatesState,
  MatesView,
  StageId,
} from './types';

const elementSchema = z.enum(ELEMENTS);
const cellIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(CELLS - 1);

export const matesMoveSchema: z.ZodType<MatesMove, z.ZodTypeDef, unknown> = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('pick'),
      elements: z.tuple([elementSchema, elementSchema]),
      stage: z.enum(STAGES),
    }),
    z.object({ type: z.literal('swap'), a: cellIndexSchema, b: cellIndexSchema }),
    z.object({ type: z.literal('evolve'), slot: z.number().int().min(0).max(1) }),
    z.object({ type: z.literal('boost'), slot: z.number().int().min(0).max(1) }),
  ],
);

const optionsSchema = z
  .object({ matchBonus: z.boolean().default(false) })
  .passthrough()
  .transform((o): MatesOptions => ({ matchBonus: o.matchBonus }));

const err = (error: string): MoveValidation => ({ ok: false, error });
const OK: MoveValidation = { ok: true };

export const START_HP = 60;
/** The player who moves second starts with a few extra hit points. */
export const SECOND_PLAYER_HP = 5;
export const MOVES_PER_TURN = 2;
export const BOMB_FUSE = 3;
export const MAX_BOMBS = 2;
/** Most tile kinds that freeze after a move (Frost Lake). */
export const MAX_FROZEN_KINDS = 2;
/** Milliseconds a client needs for each step / attack, so computers wait for the animation. */
export const STEP_MS = 650;
export const FIRE_MS = 1300;
export const SWAP_MS = 300;

function createInitialState(players: GamePlayer[], options: MatesOptions, rng: Rng): MatesState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
    throw new Error(`Match Mates needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  const make = (p: GamePlayer): MatePlayer => ({
    id: p.id,
    hp: START_HP,
    maxHp: START_HP,
    monsters: [],
    berries: 0,
    picked: false,
    pickStage: null,
    moveDelta: 0,
  });
  const first = (players[rng.int(2)] as GamePlayer).id;
  return {
    phase: 'pick',
    players: [make(players[0] as GamePlayer), make(players[1] as GamePlayer)],
    options,
    stage: 'stadium',
    board: [],
    first,
    turn: first,
    movesLeft: 0,
    extraUsed: false,
    winner: null,
    moveCount: 0,
    lastEvent: null,
  };
}

const playerOf = (s: MatesState, id: PlayerId) => s.players.find((p) => p.id === id);
const otherOf = (s: MatesState, id: PlayerId) => s.players.find((p) => p.id !== id)!;

function validateMove(state: MatesState, playerId: PlayerId, move: MatesMove): MoveValidation {
  const me = playerOf(state, playerId);
  if (!me) return err('Not your turn');
  if (state.phase === 'over') return err('The game is over');
  if (move.type === 'pick') {
    if (state.phase !== 'pick') return err('The duel has already started');
    if (me.picked) return err('You have already picked your monsters');
    if (move.elements[0] === move.elements[1]) return err('Pick two different monsters');
    return OK;
  }
  if (state.phase !== 'play') return err('The duel has not started yet');
  if (state.turn !== playerId) return err('Not your turn');
  if (move.type === 'swap') {
    const { a, b } = move;
    if (!adjacent(a, b)) return err('Swap two neighbouring tiles');
    if (state.board[a]?.frozen || state.board[b]?.frozen)
      return err('Frozen tiles cannot be moved');
    if (!trySwap(state.board, a, b)) return err('That swap does not make a match');
    return OK;
  }
  const monster = me.monsters[move.slot];
  if (!monster) return err('That monster is not on your team');
  if (move.type === 'evolve') {
    if (monster.evolved) return err('That monster has already evolved');
    if (me.berries < evolveCost(state.stage)) return err('Not enough berries');
    return OK;
  }
  if (!monster.evolved) return err('Only an evolved monster can be boosted');
  if (me.berries < BERRIES_TO_EVOLVE) return err('Not enough berries');
  return OK;
}

/** Working copy of a move while it resolves. */
interface Ctx {
  board: MateCell[];
  me: MatePlayer;
  opp: MatePlayer;
  stage: StageId;
  options: MatesOptions;
  rng: Rng;
  steps: MateStep[];
  fires: MateFire[];
  longest: number;
  /** Tile kinds cleared this move, in order of first appearance. */
  kinds: string[];
  heal: number;
  bonusDamage: number;
}

const clone = (b: readonly MateCell[]): MateCell[] => b.map((c) => ({ ...c }));

function hurt(p: MatePlayer, amount: number) {
  p.hp = Math.max(0, p.hp - amount);
}

/** One cascade: clear the matched squares, pay out mana / berries, drop, refill. */
function clearMatches(c: Ctx, cells: Set<number>) {
  let lava = 0;
  for (const i of cells) {
    const k = c.board[i]!.k;
    if (!c.kinds.includes(k)) c.kinds.push(k);
    if (k === 'berry') c.me.berries += 1;
    else if (k !== 'bomb' && k !== 'mystery') {
      for (const m of c.me.monsters) if (m.element === k) m.mana += 1;
      if (k === 'fire' && c.stage === 'lava') lava += 1;
    }
  }
  if (lava) hurt(c.opp, lava);
  c.board = dropAndRefill(c.board, cells, c.rng);
  c.steps.push({ cleared: [...cells].sort((x, y) => x - y), board: clone(c.board) });
}

function specOf(m: MateMonster) {
  return MONSTERS[m.element];
}

/** Every monster of the mover with a full mana bar uses its special attack. Returns whether any did. */
function fireReady(c: Ctx): boolean {
  let any = false;
  c.me.monsters.forEach((m, slot) => {
    const spec = specOf(m);
    const form = m.evolved ? 1 : 0;
    while (m.mana >= spec.cost && c.opp.hp > 0) {
      m.mana -= spec.cost;
      any = true;
      const damage = spec.damage[form];
      hurt(c.opp, damage);
      const power = spec.power[form];
      let changed: number[] | undefined;
      if (m.element === 'water') {
        const targets = c.board.flatMap((t, i) => (t.k !== 'water' && t.k !== 'bomb' ? [i] : []));
        changed = [];
        for (let n = 0; n < power && targets.length > 0; n++) {
          const pick = targets.splice(c.rng.int(targets.length), 1)[0] as number;
          c.board[pick] = { ...c.board[pick]!, k: 'water' };
          changed.push(pick);
        }
      } else if (m.element === 'earth') c.me.berries += power;
      else if (m.element === 'electric') c.opp.moveDelta -= power;
      else if (m.element === 'psychic') {
        const berries = Math.min(power, c.opp.berries);
        c.opp.berries -= berries;
        c.me.berries += berries;
        for (let n = 0; n < power; n++) {
          const pool = c.opp.monsters.filter((o) => o.mana > 0);
          if (pool.length === 0) break;
          (pool[c.rng.int(pool.length)] as MateMonster).mana -= 1;
          m.mana += 1;
        }
      }
      c.fires.push({
        step: c.steps.length,
        owner: c.me.id,
        slot,
        element: m.element,
        evolved: m.evolved,
        damage,
        heal: 0,
      });
      if (changed && changed.length > 0)
        c.steps.push({ cleared: [], board: clone(c.board), changed });
    }
  });
  return any;
}

/** Clear matches and fire ready attacks until the board is quiet. */
function settle(c: Ctx) {
  for (let guard = 0; guard < 60 && c.opp.hp > 0; guard++) {
    const m = findMatches(c.board);
    if (m.cells.size > 0) {
      c.longest = Math.max(c.longest, m.longest);
      clearMatches(c, m.cells);
      continue;
    }
    if (!fireReady(c)) break;
  }
}

/** Reactor: every move the bombs tick; at zero they blow up the squares around them. */
function tickBombs(c: Ctx) {
  const blown = new Set<number>();
  c.board.forEach((cell, i) => {
    if (cell.k !== 'bomb') return;
    cell.fuse = (cell.fuse ?? 1) - 1;
    if (cell.fuse > 0) return;
    const r = Math.floor(i / COLS);
    const col = i % COLS;
    blown.add(i);
    for (let d = 1; d <= 2; d++) {
      if (r - d >= 0) blown.add(cellAt(r - d, col));
      if (r + d < ROWS) blown.add(cellAt(r + d, col));
      if (col - d >= 0) blown.add(cellAt(r, col - d));
      if (col + d < COLS) blown.add(cellAt(r, col + d));
    }
  });
  if (blown.size === 0) return;
  c.board = dropAndRefill(c.board, blown, c.rng);
  c.steps.push({ cleared: [...blown].sort((x, y) => x - y), board: clone(c.board), bomb: true });
  settle(c);
}

/** After a swap: thaw, and (Frost Lake) freeze the other tiles of what was matched. */
function freeze(c: Ctx) {
  for (const cell of c.board) delete cell.frozen;
  if (c.stage !== 'frost') return;
  const kinds = c.kinds
    .filter((k) => (ELEMENTS as readonly string[]).includes(k))
    .slice(0, MAX_FROZEN_KINDS);
  for (const cell of c.board) if (kinds.includes(cell.k)) cell.frozen = true;
}

function ensureMoves(c: Ctx) {
  if (legalSwaps(c.board).length > 0) return;
  // Frozen tiles may be all that stands in the way: thaw them before shuffling.
  if (c.board.some((cell) => cell.frozen)) {
    for (const cell of c.board) delete cell.frozen;
    if (legalSwaps(c.board).length > 0) return;
  }
  c.board = createBoard(c.rng);
  c.steps.push({ cleared: [], board: clone(c.board), shuffled: true });
}

/** Turn-start effects of the stage on the board. */
function stageTurnStart(board: MateCell[], stage: StageId, rng: Rng) {
  if (stage === 'reactor' && board.filter((x) => x.k === 'bomb').length < MAX_BOMBS) {
    const spots = board.flatMap((x, i) => (x.k !== 'bomb' ? [i] : []));
    const at = spots[rng.int(spots.length)] as number;
    board[at] = { k: 'bomb', fuse: BOMB_FUSE };
  }
  if (stage === 'swamp') {
    for (const cell of board) delete cell.hidden;
    const at = rng.int(board.length);
    board[at] = { ...board[at]!, hidden: true };
  }
}

function applyMove(state: MatesState, playerId: PlayerId, move: MatesMove, rng: Rng): MatesState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);

  if (move.type === 'pick') {
    const players = state.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            picked: true,
            pickStage: move.stage,
            monsters: move.elements.map((element): MateMonster => ({
              element,
              evolved: false,
              mana: 0,
            })),
          }
        : p,
    ) as MatesState['players'];
    if (!players.every((p) => p.picked)) return { ...state, players };
    // Both players name a stage: when they differ, the dice decide.
    const wanted = players.map((p) => p.pickStage as StageId);
    const stage =
      wanted[0] === wanted[1] ? (wanted[0] as StageId) : (wanted[rng.int(2)] as StageId);
    const board = createBoard(rng);
    stageTurnStart(board, stage, rng);
    const sized = players.map((p) =>
      p.id === state.first
        ? p
        : { ...p, hp: START_HP + SECOND_PLAYER_HP, maxHp: START_HP + SECOND_PLAYER_HP },
    ) as MatesState['players'];
    return {
      ...state,
      players: sized,
      phase: 'play',
      stage,
      board,
      turn: state.first,
      movesLeft: MOVES_PER_TURN,
      extraUsed: false,
    };
  }

  const me = {
    ...(playerOf(state, playerId) as MatePlayer),
    monsters: playerOf(state, playerId)!.monsters.map((m) => ({ ...m })),
  };
  const oppSrc = otherOf(state, playerId);
  const opp = { ...oppSrc, monsters: oppSrc.monsters.map((m) => ({ ...m })) };
  const c: Ctx = {
    board: clone(state.board),
    me,
    opp,
    stage: state.stage,
    options: state.options,
    rng,
    steps: [],
    fires: [],
    longest: 0,
    kinds: [],
    heal: 0,
    bonusDamage: 0,
  };
  const event: MateEvent = {
    seq: state.moveCount + 1,
    by: playerId,
    kind: move.type,
    steps: c.steps,
    fires: c.fires,
    longest: 0,
    extraMove: false,
    win: false,
  };
  let extra = 0;
  let extraUsed = state.extraUsed;

  if (move.type === 'swap') {
    const swapped = trySwap(c.board, move.a, move.b) as MateCell[];
    c.board = swapped;
    event.a = move.a;
    event.b = move.b;
    event.swapped = clone(swapped);
    settle(c);
    freeze(c);
    if (c.longest >= 4 && c.opp.hp > 0) {
      if (state.options.matchBonus) {
        extra = 1;
        if (c.longest >= 5) me.hp = Math.min(me.maxHp, me.hp + 5);
        if (c.longest >= 6) hurt(opp, 5);
      } else if (!extraUsed) {
        extra = 1;
        extraUsed = true;
      }
    }
    if (c.opp.hp > 0) tickBombs(c);
  } else if (move.type === 'evolve') {
    me.berries -= evolveCost(state.stage);
    (me.monsters[move.slot] as MateMonster).evolved = true;
    event.slot = move.slot;
    settle(c);
  } else {
    me.berries -= BERRIES_TO_EVOLVE;
    (me.monsters[move.slot] as MateMonster).mana += BOOST_MANA;
    event.slot = move.slot;
    settle(c);
  }
  if (c.opp.hp > 0) ensureMoves(c);

  event.longest = c.longest;
  event.extraMove = extra > 0;
  const win = opp.hp <= 0;
  event.win = win;
  event.steps = c.steps;
  const players = state.players.map((p) => (p.id === playerId ? me : opp)) as MatesState['players'];
  const base: MatesState = {
    ...state,
    players,
    board: c.board,
    moveCount: state.moveCount + 1,
    lastEvent: event,
    extraUsed,
  };
  if (win) return { ...base, phase: 'over', winner: playerId, movesLeft: 0 };

  const movesLeft = state.movesLeft - 1 + extra;
  if (movesLeft > 0) return { ...base, movesLeft };

  // Turn over: the opponent starts, with any moves the attacks gave or took.
  const next = base.players.map((p) =>
    p.id === opp.id ? { ...p, moveDelta: 0 } : p,
  ) as MatesState['players'];
  const board = clone(base.board);
  stageTurnStart(board, state.stage, rng);
  return {
    ...base,
    players: next,
    board,
    turn: opp.id,
    movesLeft: Math.max(1, MOVES_PER_TURN + opp.moveDelta),
    extraUsed: false,
  };
}

function getPlayerView(state: MatesState, playerId: PlayerId): MatesView {
  const me = playerOf(state, playerId) ?? state.players[0];
  const opp = otherOf(state, me.id);
  const picking = state.phase === 'pick';
  const mask = (b: MateCell[]): MateCell[] =>
    b.map((c) => {
      if (!c.hidden) return c;
      const { frozen } = c;
      return { k: 'mystery', hidden: true, ...(frozen ? { frozen } : {}) };
    });
  const lastEvent = state.lastEvent
    ? {
        ...state.lastEvent,
        ...(state.lastEvent.swapped ? { swapped: mask(state.lastEvent.swapped) } : {}),
        steps: state.lastEvent.steps.map((s) => ({ ...s, board: mask(s.board) })),
      }
    : null;
  // While picking, nothing about the opponent's choice is shown.
  const hide = (p: MatePlayer): MatePlayer =>
    picking ? { ...p, monsters: [], pickStage: null } : p;
  return {
    phase: state.phase,
    me: me.id,
    opponent: opp.id,
    players: [me, hide(opp)],
    picked: { [me.id]: me.picked, [opp.id]: opp.picked },
    stage: picking ? null : state.stage,
    options: state.options,
    board: mask(state.board),
    first: state.first,
    turn: state.turn,
    movesLeft: state.movesLeft,
    extraUsed: state.extraUsed,
    winner: state.winner,
    moveCount: state.moveCount,
    lastEvent,
  };
}

function getCurrentPlayers(state: MatesState): PlayerId[] {
  if (state.phase === 'pick') return state.players.filter((p) => !p.picked).map((p) => p.id);
  if (state.phase === 'play') return [state.turn];
  return [];
}

function getResults(state: MatesState): GameResults {
  const winner = state.winner ?? state.players[0].id;
  return {
    rankings: state.players
      .map((p) => ({ playerId: p.id, score: p.hp, rank: p.id === winner ? 1 : 2 }))
      .sort((a, b) => a.rank - b.rank),
  };
}

/** How good the position is for `id`, for the computer's one-move look-ahead. */
function evaluate(state: MatesState, id: PlayerId): number {
  const me = playerOf(state, id) as MatePlayer;
  const opp = otherOf(state, id);
  if (state.winner === id) return 1e6;
  let score = (me.hp - opp.hp) * 4;
  for (const m of me.monsters) {
    const cost = MONSTERS[m.element].cost;
    score += (m.mana / cost) * 6 + (m.evolved ? 8 : 0);
  }
  score += me.berries * 1.5;
  for (const m of opp.monsters) score -= (m.mana / MONSTERS[m.element].cost) * 2;
  if (state.turn === id) score += state.movesLeft * 3;
  return score;
}

/** The computer: tries every legal move on a copy of the game and keeps the best one (evolving when it can). */
function autoMove(state: MatesState, playerId: PlayerId, rng: Rng): AutoMove<MatesMove> {
  if (state.phase === 'pick') {
    const pool = [...ELEMENTS] as Element[];
    const elements: Element[] = [];
    for (let n = 0; n < 2; n++) elements.push(pool.splice(rng.int(pool.length), 1)[0] as Element);
    const stage = STAGES[rng.int(STAGES.length)] as StageId;
    return {
      move: { type: 'pick', elements: elements as [Element, Element], stage },
      endsTurn: true,
    };
  }
  const candidates: MatesMove[] = legalSwaps(state.board).map(([a, b]) => ({ type: 'swap', a, b }));
  const me = playerOf(state, playerId) as MatePlayer;
  me.monsters.forEach((m, slot) => {
    const evolve: MatesMove = { type: 'evolve', slot };
    const boost: MatesMove = { type: 'boost', slot };
    if (validateMove(state, playerId, evolve).ok) candidates.push(evolve);
    if (validateMove(state, playerId, boost).ok) candidates.push(boost);
  });
  const seed = rng.int(2 ** 30);
  let best = candidates[0] as MatesMove;
  let bestScore = -Infinity;
  for (const move of candidates) {
    const after = applyMove(state, playerId, move, createSeededRng(seed));
    // A small random nudge so two computers do not play the same game.
    const score = evaluate(after, playerId) + rng.int(100) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  const after = applyMove(state, playerId, best, createSeededRng(seed));
  return { move: best, endsTurn: after.phase === 'over' || after.turn !== playerId };
}

const eventMs = (e: MateEvent | null): number =>
  e ? SWAP_MS + e.steps.length * STEP_MS + e.fires.length * FIRE_MS : 0;

export const matesGame: GameDefinition<MatesState, MatesMove, MatesOptions, MatesView> = {
  id: 'matchmates',
  name: 'Match Mates',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  defaultOptions: { matchBonus: false },
  moveSchema: matesMoveSchema,
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
  // Both players pick at the same time: one deadline for the whole phase.
  keepsClock: (before, after) => before.phase === 'pick' && after.phase === 'pick',
  settleMs: (state) => eventMs(state.lastEvent),
  supportsBots: true,
};
