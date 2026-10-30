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
  swapCells,
  adjacent,
  cellAt,
} from './board';
import { MONSTERS, boostMana, evolveCost, maxBerries } from './monsters';
import { CELLS, COLS, ELEMENTS, HP_CHOICES, MAX_PLAYERS, MIN_PLAYERS, ROWS, STAGES } from './types';
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
    z.object({ type: z.literal('draft'), element: elementSchema }),
    z.object({ type: z.literal('confirm'), stage: z.enum([...STAGES, 'random']) }),
    z.object({ type: z.literal('swap'), a: cellIndexSchema, b: cellIndexSchema }),
    z.object({ type: z.literal('evolve'), slot: z.number().int().min(0).max(1) }),
    z.object({ type: z.literal('boost'), slot: z.number().int().min(0).max(1) }),
  ],
);

const optionsSchema = z
  .object({
    hp: z
      .number()
      .refine((n) => (HP_CHOICES as readonly number[]).includes(n))
      .default(HP_CHOICES[0]),
  })
  .passthrough()
  .transform((o): MatesOptions => ({ hp: o.hp }));

const err = (error: string): MoveValidation => ({ ok: false, error });
const OK: MoveValidation = { ok: true };

export const START_HP = HP_CHOICES[0];
/** The player who moves second starts with a few extra hit points. */
export const SECOND_PLAYER_HP = 5;
export const MOVES_PER_TURN = 2;
/** Hit points a line of 5 or more heals. */
export const COMBO_HEAL = 5;
export const BOMB_FUSE = 3;
export const MAX_BOMBS = 2;
/** Most charged tiles on the board at once (Laboratory). */
export const MAX_CHARGED = 3;
/** Most tile kinds that freeze after a move (Frost Lake). */
export const MAX_FROZEN_KINDS = 2;
/** Milliseconds a client needs for each step / attack, so computers wait for the animation. */
export const STEP_MS = 650;
export const FIRE_MS = 3700;
/** A step that only changes tiles (Water turns tiles blue): current -> blue -> current -> blue takes this long. */
export const CHANGE_MS = 1100;
export const SWAP_MS = 300;
/** The evolve animation, and the text that says "extra move" / "turn lost" after a move. */
export const EVOLVE_MS = 1800;
export const NOTE_MS = 800;
/** Extra wait of the computer after the animations of a move have ended. */
export const BOT_PAUSE_MS = 1000;
/** Milliseconds the clients spend on the coin flip that picks the arena and who starts. */
export const COIN_MS = 3600;
/** After the coin flip the arena comes in: pets spawn, hit points count up, the tiles drop in. */
export const INTRO_MS = 2700;

/** Draft order: the first drafter, then the second twice, then the first again. */
export const DRAFT_ORDER = [0, 1, 1, 0] as const;

/** Whose pick it is in the draft, or null once all four pets are chosen. */
export function draftTurn(state: MatesState): PlayerId | null {
  const picked = state.players.reduce((n, p) => n + p.monsters.length, 0);
  if (picked >= DRAFT_ORDER.length) return null;
  const second = (state.players.find((p) => p.id !== state.draftFirst) as MatePlayer).id;
  return DRAFT_ORDER[picked] === 0 ? state.draftFirst : second;
}

function createInitialState(players: GamePlayer[], options: MatesOptions, rng: Rng): MatesState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
    throw new Error(`Pet Match needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  const make = (p: GamePlayer): MatePlayer => ({
    id: p.id,
    hp: options.hp,
    maxHp: options.hp,
    monsters: [],
    berries: 0,
    confirmed: false,
    stagePick: null,
  });
  const first = (players[rng.int(2)] as GamePlayer).id;
  return {
    phase: 'pick',
    players: [make(players[0] as GamePlayer), make(players[1] as GamePlayer)],
    options,
    stage: 'stadium',
    board: [],
    first,
    draftFirst: first,
    coinWinner: null,
    turn: first,
    movesLeft: 0,
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
  if (move.type === 'draft' || move.type === 'confirm') {
    if (state.phase !== 'pick') return err('The duel has already started');
    const drafter = draftTurn(state);
    if (move.type === 'draft') {
      if (drafter === null) return err('The draft is over: confirm your arena');
      if (drafter !== playerId) return err('It is not your turn to pick');
      if (state.players.some((p) => p.monsters.some((m) => m.element === move.element)))
        return err('That pet has already been picked');
      return OK;
    }
    if (drafter !== null) return err('The draft is not finished yet');
    if (me.confirmed) return err('You have already confirmed');
    return OK;
  }
  if (state.phase !== 'play') return err('The duel has not started yet');
  if (state.turn !== playerId) return err('Not your turn');
  if (move.type === 'swap') {
    const { a, b } = move;
    if (!adjacent(a, b)) return err('Swap two neighbouring tiles');
    if (state.board[a]?.frozen || state.board[b]?.frozen)
      return err('Frozen tiles cannot be moved');
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
  if (me.berries < evolveCost(state.stage)) return err('Not enough berries');
  return OK;
}

/** Working copy of a move while it resolves. */
interface Ctx {
  board: MateCell[];
  me: MatePlayer;
  opp: MatePlayer;
  stage: StageId;
  rng: Rng;
  steps: MateStep[];
  fires: MateFire[];
  longest: number;
  /** Tile kinds cleared this move, in order of first appearance. */
  kinds: string[];
  /** A special attack fired during this move: what it clears and what falls after it never counts for combos. */
  attacked: boolean;
}

const clone = (b: readonly MateCell[]): MateCell[] => b.map((c) => ({ ...c }));

function hurt(p: MatePlayer, amount: number) {
  p.hp = Math.max(0, p.hp - amount);
}

/** One cascade: clear the matched squares, pay out mana / berries, drop, refill. */
function clearMatches(c: Ctx, matched: Set<number>) {
  let lava = 0;
  // Laboratory: every charged tile in the match takes two more random tiles with it (all for the mover).
  const cells = new Set(matched);
  const charged = c.stage === 'lab' ? [...matched].filter((i) => c.board[i]?.charged) : [];
  const pulled: number[] = [];
  for (let ci = 0; ci < charged.length; ci++)
    for (let n = 0; n < 2; n++) {
      const free = c.board.flatMap((_t, i) => (cells.has(i) ? [] : [i]));
      if (free.length === 0) break;
      const pick = free[c.rng.int(free.length)] as number;
      cells.add(pick);
      pulled.push(pick);
    }
  const sorted = [...cells].sort((x, y) => x - y);
  const kindsBefore = new Map(sorted.map((i) => [i, c.board[i]!.k]));
  for (const i of cells) {
    const k = c.board[i]!.k;
    if (!c.kinds.includes(k)) c.kinds.push(k);
    if (k === 'berry') c.me.berries = Math.min(maxBerries(c.stage), c.me.berries + 1);
    else if (k !== 'bomb' && k !== 'mystery') {
      // A bar never holds more than it needs: tiles beyond a full bar do not count for the next attack.
      for (const m of c.me.monsters)
        if (m.element === k) m.mana = Math.min(MONSTERS[k].cost, m.mana + 1);
      if (k === 'fire' && c.stage === 'lava') lava += 1;
    }
  }
  if (lava) hurt(c.opp, lava);
  c.board = dropAndRefill(c.board, cells, c.rng);
  c.steps.push({
    cleared: sorted,
    kinds: sorted.map((i) => kindsBefore.get(i) as string),
    board: clone(c.board),
    ...(charged.length
      ? { charged: [...charged].sort((x, y) => x - y), pulled: pulled.sort((x, y) => x - y) }
      : {}),
  });
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
      // The attack empties the bar; only tiles that fall or match after it (from the attack itself) fill it again.
      m.mana = 0;
      any = true;
      c.attacked = true;
      const damage = spec.damage[form];
      hurt(c.opp, damage);
      const power = spec.power[form];
      const heal = spec.heal[form];
      let changed: number[] | undefined;
      let cleared: Set<number> | undefined;
      let drain: number | undefined;
      if (m.element === 'water') {
        const targets = c.board.flatMap((t, i) => (t.k !== 'water' && t.k !== 'bomb' ? [i] : []));
        changed = [];
        for (let n = 0; n < power && targets.length > 0; n++) {
          const pick = targets.splice(c.rng.int(targets.length), 1)[0] as number;
          c.board[pick] = { ...c.board[pick]!, k: 'water' };
          changed.push(pick);
        }
      } else if (m.element === 'earth')
        c.me.hp += heal; // (healing has no cap: hit points can go above the start value)
      else if (m.element === 'fire') {
        // `power` random columns count as matched.
        const cols = Array.from({ length: COLS }, (_, i) => i);
        cleared = new Set();
        for (let n = 0; n < power; n++) {
          const col = cols.splice(c.rng.int(cols.length), 1)[0] as number;
          for (let r = 0; r < ROWS; r++) cleared.add(cellAt(r, col));
        }
      } else if (m.element === 'electric') {
        // A random block, `power` wide and 2 high, counts as matched.
        const r0 = c.rng.int(ROWS - 1);
        const c0 = c.rng.int(COLS - power + 1);
        cleared = new Set();
        for (let r = r0; r < r0 + 2; r++)
          for (let col = c0; col < c0 + power; col++) cleared.add(cellAt(r, col));
      } else if (m.element === 'psychic') {
        drain = power;
        for (const o of c.opp.monsters) o.mana = Math.max(0, o.mana - power);
      }
      c.fires.push({
        step: c.steps.length,
        owner: c.me.id,
        slot,
        element: m.element,
        evolved: m.evolved,
        damage,
        heal,
        ...(drain ? { drain } : {}),
        ...(cleared ? { cells: [...cleared].sort((x, y) => x - y) } : {}),
        ...(changed && changed.length > 0 ? { cells: changed } : {}),
      });
      if (changed && changed.length > 0)
        c.steps.push({ cleared: [], board: clone(c.board), changed });
      if (cleared) {
        clearMatches(c, cleared);
        (c.steps[c.steps.length - 1] as MateStep).ability = true;
      }
    }
  });
  return any;
}

/** Clear matches and fire ready attacks until the board is quiet. */
function settle(c: Ctx) {
  for (let guard = 0; guard < 60 && c.opp.hp > 0; guard++) {
    const m = findMatches(c.board);
    if (m.cells.size > 0) {
      if (!c.attacked) c.longest = Math.max(c.longest, m.biggest);
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

/** Turn-start effects of the stage on the board. */
function stageTurnStart(board: MateCell[], stage: StageId, rng: Rng) {
  if (stage === 'reactor' && board.filter((x) => x.k === 'bomb').length < MAX_BOMBS) {
    const spots = board.flatMap((x, i) => (x.k !== 'bomb' ? [i] : []));
    const at = spots[rng.int(spots.length)] as number;
    board[at] = { k: 'bomb', fuse: BOMB_FUSE };
  }
  if (stage === 'lab' && board.filter((x) => x.charged).length < MAX_CHARGED) {
    // Every round another tile gets charged (up to a few at a time).
    const spots = board.flatMap((x, i) => (x.k !== 'bomb' && !x.charged ? [i] : []));
    const at = spots[rng.int(spots.length)] as number;
    board[at] = { ...board[at]!, charged: true };
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

  if (move.type === 'draft') {
    const players = state.players.map((p) =>
      p.id === playerId
        ? { ...p, monsters: [...p.monsters, { element: move.element, evolved: false, mana: 0 }] }
        : p,
    ) as MatesState['players'];
    return { ...state, players };
  }
  if (move.type === 'confirm') {
    const players = state.players.map((p) =>
      p.id === playerId ? { ...p, confirmed: true, stagePick: move.stage } : p,
    ) as MatesState['players'];
    if (!players.every((p) => p.confirmed)) return { ...state, players };
    // Both are ready: a coin is flipped. Whoever wins it gets their arena, plays second and has extra hit points.
    const winner = players[rng.int(2)] as MatePlayer;
    const wanted = winner.stagePick as StageId | 'random';
    const stage = wanted === 'random' ? (STAGES[rng.int(STAGES.length)] as StageId) : wanted;
    const board = createBoard(rng);
    stageTurnStart(board, stage, rng);
    const first = (players.find((p) => p.id !== winner.id) as MatePlayer).id;
    const sized = players.map((p) =>
      p.id === winner.id
        ? { ...p, hp: p.maxHp + SECOND_PLAYER_HP, maxHp: p.maxHp + SECOND_PLAYER_HP }
        : p,
    ) as MatesState['players'];
    return {
      ...state,
      players: sized,
      phase: 'play',
      stage,
      board,
      first,
      coinWinner: winner.id,
      turn: first,
      movesLeft: MOVES_PER_TURN,
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
    rng,
    steps: [],
    fires: [],
    longest: 0,
    kinds: [],
    attacked: false,
  };
  const event: MateEvent = {
    seq: state.moveCount + 1,
    by: playerId,
    kind: move.type,
    steps: c.steps,
    fires: c.fires,
    longest: 0,
    noMatch: false,
    heal: 0,
    extraMove: false,
    win: false,
  };
  let extra = 0;
  let noMatch = false;
  let healed = 0;

  if (move.type === 'swap') {
    const swapped = swapCells(c.board, move.a, move.b) as MateCell[];
    c.board = swapped;
    event.a = move.a;
    event.b = move.b;
    event.swapped = clone(swapped);
    settle(c);
    freeze(c);
    // A swap that makes nothing: the tiles stay swapped and the move is spent.
    noMatch = c.steps.length === 0;
    if (c.longest >= 4 && c.opp.hp > 0) {
      // 4 in a row: an extra move; 5 or more also heals 5.
      if (c.longest >= 5) {
        me.hp += COMBO_HEAL;
        healed = COMBO_HEAL;
      }
      // Every such line gives an extra move; 6 or more also hits for 5.
      extra = 1;
      if (c.longest >= 6) hurt(opp, 5);
    }
    if (c.opp.hp > 0) tickBombs(c);
  } else if (move.type === 'evolve') {
    event.before = clone(state.board);
    me.berries -= evolveCost(state.stage);
    (me.monsters[move.slot] as MateMonster).evolved = true;
    event.slot = move.slot;
    settle(c);
  } else {
    event.before = clone(state.board);
    me.berries -= evolveCost(state.stage);
    const boosted = me.monsters[move.slot] as MateMonster;
    boosted.mana = Math.min(MONSTERS[boosted.element].cost, boosted.mana + boostMana(state.stage));
    event.slot = move.slot;
    settle(c);
  }

  event.longest = c.longest;
  event.noMatch = noMatch;
  event.heal = healed;
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
  };
  if (win) return { ...base, phase: 'over', winner: playerId, movesLeft: 0 };

  // Evolving and a swap that matches nothing each cost one move.
  const movesLeft = state.movesLeft - 1 + extra;
  if (movesLeft > 0) return { ...base, movesLeft };

  // Turn over: the opponent starts, with any moves the attacks gave or took.
  const next = base.players.map((p) => p) as MatesState['players'];
  const board = clone(base.board);
  stageTurnStart(board, state.stage, rng);
  return {
    ...base,
    players: next,
    board,
    turn: opp.id,
    movesLeft: MOVES_PER_TURN,
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
        ...(state.lastEvent.before ? { before: mask(state.lastEvent.before) } : {}),
        steps: state.lastEvent.steps.map((s) => ({ ...s, board: mask(s.board) })),
      }
    : null;
  // The opponent's arena choice stays secret until the coin has been flipped.
  const hide = (p: MatePlayer): MatePlayer => (picking ? { ...p, stagePick: null } : p);
  return {
    phase: state.phase,
    me: me.id,
    opponent: opp.id,
    players: [me, hide(opp)],
    confirmed: { [me.id]: me.confirmed, [opp.id]: opp.confirmed },
    drafter: picking ? draftTurn(state) : null,
    coinWinner: state.coinWinner,
    stage: picking ? null : state.stage,
    options: state.options,
    board: mask(state.board),
    first: state.first,
    turn: state.turn,
    movesLeft: state.movesLeft,
    winner: state.winner,
    moveCount: state.moveCount,
    lastEvent,
  };
}

/** A watcher sees both sides; the arena picks stay secret until the coin has been flipped. */
function getSpectatorView(state: MatesState, watcherId: PlayerId): MatesView {
  const view = getPlayerView(state, watcherId);
  if (state.phase !== 'pick') return view;
  return {
    ...view,
    players: view.players.map((p) => ({ ...p, stagePick: null })) as MatesView['players'],
  };
}

function getCurrentPlayers(state: MatesState): PlayerId[] {
  if (state.phase === 'pick') {
    const drafter = draftTurn(state);
    return drafter !== null
      ? [drafter]
      : state.players.filter((p) => !p.confirmed).map((p) => p.id);
  }
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
    if (draftTurn(state) !== null) {
      const taken = state.players.flatMap((p) => p.monsters.map((m) => m.element));
      const free = ELEMENTS.filter((e) => !taken.includes(e));
      return {
        move: { type: 'draft', element: free[rng.int(free.length)] as Element },
        endsTurn: true,
      };
    }
    return {
      move: { type: 'confirm', stage: STAGES[rng.int(STAGES.length)] as StageId },
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
  if (candidates.length === 0) {
    // Nothing can match: set something up. Any swap of two loose neighbours that leaves a matching swap
    // behind (else any swap at all, picked at random so the same two tiles are not swapped back and forth).
    const loose: [number, number][] = [];
    for (let i = 0; i < CELLS; i++)
      for (const j of [i + 1, i + COLS])
        if (j < CELLS && (j !== i + 1 || j % COLS !== 0) && swapCells(state.board, i, j))
          loose.push([i, j]);
    const setups = loose.filter(
      ([i, j]) => legalSwaps(swapCells(state.board, i, j) as MateCell[]).length > 0,
    );
    const pool = setups.length > 0 ? setups : loose;
    const [a, b] = pool[rng.int(pool.length)] as [number, number];
    return { move: { type: 'swap', a, b }, endsTurn: state.movesLeft <= 1 };
  }
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
  e
    ? SWAP_MS +
      e.steps.reduce(
        (n, s) => n + (s.changed?.length && s.cleared.length === 0 ? CHANGE_MS : STEP_MS),
        0,
      ) +
      e.fires.length * FIRE_MS +
      (e.kind === 'evolve' ? EVOLVE_MS : 0) +
      (e.heal > 0 ? NOTE_MS : 0) +
      (e.extraMove ? NOTE_MS : 0)
    : 0;

export const matesGame: GameDefinition<MatesState, MatesMove, MatesOptions, MatesView> = {
  id: 'matchmates',
  name: 'Pet Match',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  defaultOptions: { hp: START_HP },
  moveSchema: matesMoveSchema,
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getSpectatorView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
  // After the draft both confirm at the same time: one deadline for that part.
  keepsClock: (before, after) =>
    before.phase === 'pick' && after.phase === 'pick' && draftTurn(before) === null,
  // The clock starts after the coin flip that decides the arena and who starts.
  clockBonusMs: (state) =>
    state.phase === 'play' && state.moveCount === 0 ? COIN_MS + INTRO_MS : 0,
  // The computer waits for every animation of the last move, plus a breath so the "Your turn!" and the
  // numbers have been seen.
  settleMs: (state) =>
    state.phase === 'play' && state.moveCount === 0
      ? COIN_MS + INTRO_MS
      : eventMs(state.lastEvent) + (state.lastEvent ? BOT_PAUSE_MS : 0),
  supportsBots: true,
  // The match history: the arena, the pets each player ended with and the hit points left.
  matchSummary: (state) => ({
    stage: state.stage,
    moves: state.moveCount,
    players: state.players.map((p) => ({
      id: p.id,
      hp: p.hp,
      maxHp: p.maxHp,
      pets: p.monsters.map((m) => ({ element: m.element, evolved: m.evolved })),
    })),
  }),
};
