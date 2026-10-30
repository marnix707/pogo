import { z } from 'zod';
import type {
  AutoMove,
  GameDefinition,
  GamePlayer,
  GameResults,
  MoveValidation,
  PlayerId,
} from '../../game/types';
import type { Rng } from '../../game/rng';
import { BOARD, cellIndex, randomFleet, shipCells, validFleet } from './fleet';
import type { Ship } from './fleet';
import { MAX_PLAYERS, MIN_PLAYERS } from './types';
import type {
  SeaBattleEvent,
  SeaBattleMove,
  SeaBattleOptions,
  SeaBattlePlayer,
  SeaBattleState,
  SeaBattleView,
  Shot,
} from './types';

const shipSchema = z.object({
  kind: z.enum(['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer']),
  x: z
    .number()
    .int()
    .min(0)
    .max(BOARD - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(BOARD - 1),
  vertical: z.boolean(),
});

export const seaBattleMoveSchema: z.ZodType<SeaBattleMove, z.ZodTypeDef, unknown> =
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('ready'), ships: z.array(shipSchema).max(8) }),
    z.object({
      type: z.literal('fire'),
      x: z
        .number()
        .int()
        .min(0)
        .max(BOARD - 1),
      y: z
        .number()
        .int()
        .min(0)
        .max(BOARD - 1),
    }),
  ]);

const optionsSchema = z
  .object({})
  .passthrough()
  .transform(() => ({}) as SeaBattleOptions);

const err = (error: string): MoveValidation => ({ ok: false, error });
const OK: MoveValidation = { ok: true };

/** Milliseconds the clients spend on the coin flip that decides who starts. */
export const COIN_FLIP_MS = 2800;
/** Time the bomb + blast take to play out on a client. */
export const SHOT_FX_MS = 800;
/** Extra time when a shot sinks a ship: the explosions along it, the wreck going down, the banner. */
export const SINK_MS = 900;

function createInitialState(
  players: GamePlayer[],
  _options: SeaBattleOptions,
  rng: Rng,
): SeaBattleState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
    throw new Error(`Sea Battle needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  const make = (p: GamePlayer): SeaBattlePlayer => ({
    id: p.id,
    ships: [],
    ready: false,
    incoming: [],
  });
  const first = (players[rng.int(2)] as GamePlayer).id;
  return {
    phase: 'place',
    players: [make(players[0] as GamePlayer), make(players[1] as GamePlayer)],
    turn: first,
    first,
    winner: null,
    shotCount: 0,
    lastEvent: null,
  };
}

const playerOf = (state: SeaBattleState, id: PlayerId) => state.players.find((p) => p.id === id);
const otherOf = (state: SeaBattleState, id: PlayerId) => state.players.find((p) => p.id !== id)!;

/** The ship (if any) covering a cell. */
const shipAt = (ships: readonly Ship[], x: number, y: number): Ship | undefined =>
  ships.find((s) => shipCells(s).some(([cx, cy]) => cx === x && cy === y));

/** A ship is sunk when every cell of it has been hit. */
export function isSunk(ship: Ship, incoming: readonly Shot[]): boolean {
  return shipCells(ship).every(([x, y]) => incoming.some((s) => s.x === x && s.y === y));
}

function validateMove(
  state: SeaBattleState,
  playerId: PlayerId,
  move: SeaBattleMove,
): MoveValidation {
  const me = playerOf(state, playerId);
  if (!me) return err('Not your turn');
  if (state.phase === 'over') return err('The game is over');
  if (move.type === 'ready') {
    if (state.phase !== 'place') return err('The battle has already started');
    if (me.ready) return err('Your fleet is already in position');
    if (!validFleet(move.ships)) return err('Place all five ships on the board without overlap');
    return OK;
  }
  if (state.phase !== 'play') return err('The battle has not started yet');
  if (state.turn !== playerId) return err('Not your turn');
  const target = otherOf(state, playerId);
  if (target.incoming.some((s) => s.x === move.x && s.y === move.y))
    return err('You already fired at that square');
  return OK;
}

function applyMove(state: SeaBattleState, playerId: PlayerId, move: SeaBattleMove): SeaBattleState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);

  if (move.type === 'ready') {
    const players = state.players.map((p) =>
      p.id === playerId ? { ...p, ships: move.ships, ready: true } : p,
    ) as SeaBattleState['players'];
    const both = players.every((p) => p.ready);
    return { ...state, players, phase: both ? 'play' : 'place', turn: state.first };
  }

  const target = otherOf(state, playerId);
  const ship = shipAt(target.ships, move.x, move.y);
  const hit = !!ship;
  const incoming = [...target.incoming, { x: move.x, y: move.y, hit }];
  const sunkNow = ship && isSunk(ship, incoming) ? ship : undefined;
  const win = target.ships.every((s) => isSunk(s, incoming));
  const event: SeaBattleEvent = {
    seq: state.shotCount + 1,
    by: playerId,
    x: move.x,
    y: move.y,
    result: sunkNow ? 'sunk' : hit ? 'hit' : 'miss',
    ...(sunkNow ? { sunk: sunkNow.kind } : {}),
    win,
  };
  const players = state.players.map((p) =>
    p.id === target.id ? { ...p, incoming } : p,
  ) as SeaBattleState['players'];
  return {
    ...state,
    players,
    phase: win ? 'over' : 'play',
    // A hit (a sunk ship included) gives another shot; a miss hands the turn over.
    turn: win || hit ? playerId : target.id,
    winner: win ? playerId : null,
    shotCount: state.shotCount + 1,
    lastEvent: event,
  };
}

function getPlayerView(state: SeaBattleState, playerId: PlayerId): SeaBattleView {
  const me = playerOf(state, playerId) ?? state.players[0];
  const opp = otherOf(state, me.id);
  const over = state.phase === 'over';
  return {
    phase: state.phase,
    me: me.id,
    opponent: opp.id,
    turn: state.turn,
    first: state.first,
    winner: state.winner,
    ready: { [me.id]: me.ready, [opp.id]: opp.ready },
    myShips: me.ships,
    incoming: me.incoming,
    outgoing: opp.incoming,
    sunk: opp.ships.filter((s) => isSunk(s, opp.incoming)),
    revealed: over ? opp.ships.filter((s) => !isSunk(s, opp.incoming)) : [],
    lastEvent: state.lastEvent,
    shotCount: state.shotCount,
  };
}

/** A watcher sees the shots and the ships that went down, never an unsunk fleet (they could tell the other player). */
function getSpectatorView(state: SeaBattleState, watcherId: PlayerId): SeaBattleView {
  const view = getPlayerView(state, watcherId);
  if (state.phase === 'over') return view;
  const mine = playerOf(state, view.me);
  return {
    ...view,
    myShips: mine ? mine.ships.filter((s) => isSunk(s, mine.incoming)) : [],
  };
}

const getCurrentPlayers = (state: SeaBattleState): PlayerId[] => {
  if (state.phase === 'place') return state.players.filter((p) => !p.ready).map((p) => p.id);
  if (state.phase === 'play') return [state.turn];
  return [];
};

function getResults(state: SeaBattleState): GameResults {
  const winner = state.winner ?? state.players[0].id;
  const hits = (id: PlayerId) => otherOf(state, id).incoming.filter((s) => s.hit).length;
  return {
    rankings: state.players
      .map((p) => ({ playerId: p.id, score: hits(p.id), rank: p.id === winner ? 1 : 2 }))
      .sort((a, b) => a.rank - b.rank),
  };
}

/** The computer: random fleet; then hunt on a chessboard pattern and finish off ships it has hit. */
function autoMove(state: SeaBattleState, playerId: PlayerId, rng: Rng): AutoMove<SeaBattleMove> {
  if (state.phase === 'place')
    return { move: { type: 'ready', ships: randomFleet(rng) }, endsTurn: true };

  const target = otherOf(state, playerId);
  const shot = new Set(target.incoming.map((s) => cellIndex(s.x, s.y)));
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < BOARD && y < BOARD && !shot.has(cellIndex(x, y));
  // Hit cells whose ship is still afloat.
  const open = target.incoming.filter((s) => {
    if (!s.hit) return false;
    const ship = shipAt(target.ships, s.x, s.y);
    return ship ? !isSunk(ship, target.incoming) : false;
  });
  const candidates: [number, number][] = [];
  if (open.length >= 2) {
    // Two or more hits on the same ship: keep going along the line.
    const horizontal = open.every((s) => s.y === (open[0] as Shot).y);
    const vertical = open.every((s) => s.x === (open[0] as Shot).x);
    if (horizontal || vertical) {
      const xs = open.map((s) => s.x);
      const ys = open.map((s) => s.y);
      if (horizontal) {
        const y = (open[0] as Shot).y;
        candidates.push([Math.min(...xs) - 1, y], [Math.max(...xs) + 1, y]);
      } else {
        const x = (open[0] as Shot).x;
        candidates.push([x, Math.min(...ys) - 1], [x, Math.max(...ys) + 1]);
      }
    }
  }
  if (candidates.filter(([x, y]) => free(x, y)).length === 0)
    for (const s of open)
      candidates.push([s.x + 1, s.y], [s.x - 1, s.y], [s.x, s.y + 1], [s.x, s.y - 1]);
  const targets = candidates.filter(([x, y]) => free(x, y));
  if (targets.length > 0) {
    const [x, y] = targets[rng.int(targets.length)] as [number, number];
    return { move: { type: 'fire', x, y }, endsTurn: !shipAt(target.ships, x, y) };
  }
  const all: [number, number][] = [];
  for (let y = 0; y < BOARD; y++) for (let x = 0; x < BOARD; x++) if (free(x, y)) all.push([x, y]);
  const parity = all.filter(([x, y]) => (x + y) % 2 === 0);
  const pool = parity.length > 0 ? parity : all;
  const [x, y] = pool[rng.int(pool.length)] as [number, number];
  return { move: { type: 'fire', x, y }, endsTurn: !shipAt(target.ships, x, y) };
}

export const seaBattleGame: GameDefinition<
  SeaBattleState,
  SeaBattleMove,
  SeaBattleOptions,
  SeaBattleView
> = {
  id: 'seabattle',
  name: 'Sea Battle',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  defaultOptions: {},
  moveSchema: seaBattleMoveSchema,
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getSpectatorView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
  // Both players place at the same time: one deadline for the whole phase, whoever gets ready first.
  keepsClock: (before, after) => before.phase === 'place' && after.phase === 'place',
  // The clock starts after the coin flip that decides who begins.
  clockBonusMs: (state) => (state.phase === 'play' && state.shotCount === 0 ? COIN_FLIP_MS : 0),
  // Computers wait for the coin flip and for each bomb to land before they act.
  settleMs: (state) =>
    state.phase === 'play' && state.shotCount === 0
      ? COIN_FLIP_MS
      : state.lastEvent
        ? SHOT_FX_MS + (state.lastEvent.result === 'sunk' ? SINK_MS : 0)
        : 0,
  supportsBots: true,
};
