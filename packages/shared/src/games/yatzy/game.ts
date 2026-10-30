import { z } from 'zod';
import type {
  AutoMove,
  GameDefinition,
  GamePlayer,
  GameResults,
  MoveValidation,
} from '../../game/types';
import type { Rng } from '../../game/rng';
import { earnsYatzyBonus, getAllowedCategories, getScore, getTotals } from './scoring';
import { CATEGORIES, DICE_COUNT, MAX_ROLLS, ROUNDS } from './types';
import type { Category, YatzyMove, YatzyOptions, YatzyPlayerState, YatzyState } from './types';

const categorySchema = z.enum(CATEGORIES);

export const yatzyMoveSchema: z.ZodType<YatzyMove, z.ZodTypeDef, unknown> = z.discriminatedUnion(
  'type',
  [
    z.object({ type: z.literal('roll'), held: z.array(z.boolean()).length(DICE_COUNT) }),
    z.object({ type: z.literal('hold'), held: z.array(z.boolean()).length(DICE_COUNT) }),
    z.object({ type: z.literal('score'), category: categorySchema }),
  ],
);

const optionsSchema = z
  .object({ mode: z.enum(['turns', 'live']).default('turns') })
  .strict() as z.ZodType<YatzyOptions, z.ZodTypeDef, unknown>;

/** When several categories score equally, prefer sacrificing the least valuable one first. */
const DUMP_ORDER: readonly Category[] = [
  'ones',
  'twos',
  'threes',
  'yatzy',
  'largeStraight',
  'fourOfAKind',
  'smallStraight',
  'fullHouse',
  'fours',
  'threeOfAKind',
  'fives',
  'sixes',
  'chance',
];

function currentPlayer(state: YatzyState) {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error('Invalid state: no current player');
  return player;
}

const noHolds = () => Array<boolean>(DICE_COUNT).fill(false);
const isLive = (state: YatzyState) => state.mode === 'live';
const filledBoxes = (p: YatzyPlayerState) =>
  CATEGORIES.filter((c) => p.scorecard[c] !== undefined).length;
const isDone = (p: YatzyPlayerState) => filledBoxes(p) === CATEGORIES.length;

/** The dice, kept dice and rolls a player acts on: one shared set in turn-based play, their own in live play. */
function deskOf(state: YatzyState, p: YatzyPlayerState) {
  return isLive(state)
    ? { dice: p.dice ?? [], held: p.held ?? noHolds(), rollsLeft: p.rollsLeft ?? MAX_ROLLS }
    : { dice: state.dice, held: state.held, rollsLeft: state.rollsLeft };
}

function createInitialState(players: GamePlayer[], options: YatzyOptions, _rng: Rng): YatzyState {
  if (players.length < 1 || players.length > 6) throw new Error('Yatzy needs 1-6 players');
  const live = options.mode === 'live';
  return {
    mode: live ? 'live' : 'turns',
    players: players.map((p) => ({
      id: p.id,
      scorecard: {},
      yatzyBonuses: 0,
      ...(live ? { dice: [], held: noHolds(), rollsLeft: MAX_ROLLS } : {}),
    })),
    currentPlayerIndex: 0,
    round: 1,
    dice: [],
    held: noHolds(),
    rollsLeft: MAX_ROLLS,
    finished: false,
  };
}

function validateMove(state: YatzyState, playerId: string, move: YatzyMove): MoveValidation {
  if (state.finished) return { ok: false, error: 'The game is over' };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: 'You are not in this game' };
  if (isLive(state)) {
    if (isDone(player)) return { ok: false, error: 'You have filled every box' };
  } else if (currentPlayer(state).id !== playerId) return { ok: false, error: 'Not your turn' };
  const desk = deskOf(state, player);

  if (move.type === 'hold') {
    if (desk.dice.length === 0) return { ok: false, error: 'Roll the dice first' };
    if (desk.rollsLeft <= 0) return { ok: false, error: 'No rolls left, pick a category' };
    return { ok: true };
  }

  if (move.type === 'roll') {
    if (desk.rollsLeft <= 0) return { ok: false, error: 'No rolls left, pick a category' };
    if (move.held.length !== DICE_COUNT) return { ok: false, error: 'Invalid hold selection' };
    if (desk.dice.length > 0 && move.held.every(Boolean)) {
      return { ok: false, error: 'Release at least one die to roll' };
    }
    return { ok: true };
  }

  if (desk.dice.length === 0) return { ok: false, error: 'Roll the dice first' };
  const allowed = getAllowedCategories(desk.dice, player.scorecard);
  if (!allowed.includes(move.category)) return { ok: false, error: 'Category not available' };
  return { ok: true };
}

function applyMove(state: YatzyState, playerId: string, move: YatzyMove, rng: Rng): YatzyState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);
  const live = isLive(state);
  const index = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[index]!;
  const desk = deskOf(state, player);
  /** Writes a player's own dice / holds / rolls (live) or the shared ones (turn-based). */
  const withDesk = (d: { dice: number[]; held: boolean[]; rollsLeft: number }): YatzyState =>
    live
      ? { ...state, players: state.players.map((p, i) => (i === index ? { ...p, ...d } : p)) }
      : { ...state, ...d };

  if (move.type === 'hold') return withDesk({ ...desk, held: [...move.held] });

  if (move.type === 'roll') {
    const firstRoll = desk.dice.length === 0;
    const held = firstRoll ? noHolds() : move.held;
    const dice = Array.from({ length: DICE_COUNT }, (_, i) =>
      held[i] && !firstRoll ? (desk.dice[i] as number) : rng.int(6) + 1,
    );
    return withDesk({ dice, held, rollsLeft: desk.rollsLeft - 1 });
  }

  const points = getScore(desk.dice, move.category, player.scorecard);
  const bonus = earnsYatzyBonus(desk.dice, player.scorecard) ? 1 : 0;
  const players = state.players.map((p, i) =>
    i === index
      ? {
          ...p,
          scorecard: { ...p.scorecard, [move.category]: points },
          yatzyBonuses: p.yatzyBonuses + bonus,
          ...(live ? { dice: [], held: noHolds(), rollsLeft: MAX_ROLLS } : {}),
        }
      : p,
  );
  const finished = players.every(isDone);
  if (live) return { ...state, players, finished };

  const nextIndex = (state.currentPlayerIndex + 1) % players.length;
  return {
    ...state,
    players,
    currentPlayerIndex: finished ? state.currentPlayerIndex : nextIndex,
    round: finished ? ROUNDS : nextIndex === 0 ? state.round + 1 : state.round,
    dice: [],
    held: noHolds(),
    rollsLeft: MAX_ROLLS,
    finished,
  };
}

/**
 * Turn-based play shows everybody the one shared state. In live play the dice are private to each player,
 * so each player gets a view with their own dice, holds, rolls and progress in the usual (shared) fields.
 */
function getPlayerView(state: YatzyState, playerId: string): YatzyState {
  if (!isLive(state)) return state;
  const me = state.players.findIndex((p) => p.id === playerId);
  const mine = state.players[me];
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? p : { id: p.id, scorecard: p.scorecard, yatzyBonuses: p.yatzyBonuses },
    ),
    currentPlayerIndex: Math.max(0, me),
    round: mine ? Math.min(ROUNDS, filledBoxes(mine) + 1) : ROUNDS,
    dice: mine?.dice ?? [],
    held: mine?.held ?? noHolds(),
    rollsLeft: mine?.rollsLeft ?? MAX_ROLLS,
  };
}

/** A watcher looks over the shoulder of the player whose turn it is (dice are not secret). */
function getSpectatorView(state: YatzyState, _watcherId: string): YatzyState {
  const current = state.players[state.currentPlayerIndex] ?? state.players[0];
  return getPlayerView(state, current?.id ?? '');
}

function getCurrentPlayers(state: YatzyState): string[] {
  if (state.finished) return [];
  // Live: everybody who still has a box to fill plays at the same time.
  return isLive(state)
    ? state.players.filter((p) => !isDone(p)).map((p) => p.id)
    : [currentPlayer(state).id];
}

function getResults(state: YatzyState): GameResults {
  const scored = state.players
    .map((p) => ({ playerId: p.id, score: getTotals(p.scorecard, p.yatzyBonuses).grandTotal }))
    .sort((a, b) => b.score - a.score);
  // Competition ranking: ties share a rank (1, 1, 3).
  const rankings = scored.map((p) => ({
    ...p,
    rank: scored.findIndex((q) => q.score === p.score) + 1,
  }));
  return { rankings };
}

function autoMove(state: YatzyState, playerId: string, _rng: Rng): AutoMove<YatzyMove> {
  const player = state.players.find((p) => p.id === playerId) ?? currentPlayer(state);
  const desk = deskOf(state, player);
  if (desk.dice.length === 0) {
    return { move: { type: 'roll', held: noHolds() }, endsTurn: false };
  }
  const scorecard = player.scorecard;
  const allowed = getAllowedCategories(desk.dice, scorecard);
  let best = allowed[0] as Category;
  let bestScore = -1;
  for (const c of [...allowed].sort((a, b) => DUMP_ORDER.indexOf(a) - DUMP_ORDER.indexOf(b))) {
    const s = getScore(desk.dice, c, scorecard);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return { move: { type: 'score', category: best }, endsTurn: true };
}

export const yatzyGame: GameDefinition<YatzyState, YatzyMove, YatzyOptions> = {
  id: 'yatzy',
  name: 'Yatzy',
  minPlayers: 1,
  maxPlayers: 6,
  optionsSchema,
  defaultOptions: { mode: 'turns' },
  moveSchema: yatzyMoveSchema,
  isFreeMove: (move) => move.type === 'hold',
  // Live play has no turns to time: everybody just plays at their own pace.
  ignoresTurnClock: (options) => options.mode === 'live',
  createInitialState,
  validateMove,
  applyMove,
  // Turn-based: dice and scorecards are public. Live: each player sees their own dice, everybody's scorecards.
  getPlayerView,
  getSpectatorView,
  getCurrentPlayers,
  isGameOver: (state) => state.finished,
  getResults,
  autoMove,
};
