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
import type { Category, YatzyMove, YatzyOptions, YatzyState } from './types';

const categorySchema = z.enum(CATEGORIES);

export const yatzyMoveSchema: z.ZodType<YatzyMove, z.ZodTypeDef, unknown> = z.discriminatedUnion(
  'type',
  [
    z.object({ type: z.literal('roll'), held: z.array(z.boolean()).length(DICE_COUNT) }),
    z.object({ type: z.literal('hold'), held: z.array(z.boolean()).length(DICE_COUNT) }),
    z.object({ type: z.literal('score'), category: categorySchema }),
  ],
);

const optionsSchema = z.object({}).strict() as z.ZodType<YatzyOptions, z.ZodTypeDef, unknown>;

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

function createInitialState(players: GamePlayer[], _options: YatzyOptions, _rng: Rng): YatzyState {
  if (players.length < 1 || players.length > 6) throw new Error('Yatzy needs 1-6 players');
  return {
    players: players.map((p) => ({ id: p.id, scorecard: {}, yatzyBonuses: 0 })),
    currentPlayerIndex: 0,
    round: 1,
    dice: [],
    held: Array<boolean>(DICE_COUNT).fill(false),
    rollsLeft: MAX_ROLLS,
    finished: false,
  };
}

function validateMove(state: YatzyState, playerId: string, move: YatzyMove): MoveValidation {
  if (state.finished) return { ok: false, error: 'The game is over' };
  if (currentPlayer(state).id !== playerId) return { ok: false, error: 'Not your turn' };

  if (move.type === 'hold') {
    if (state.dice.length === 0) return { ok: false, error: 'Roll the dice first' };
    if (state.rollsLeft <= 0) return { ok: false, error: 'No rolls left, pick a category' };
    return { ok: true };
  }

  if (move.type === 'roll') {
    if (state.rollsLeft <= 0) return { ok: false, error: 'No rolls left, pick a category' };
    if (move.held.length !== DICE_COUNT) return { ok: false, error: 'Invalid hold selection' };
    if (state.dice.length > 0 && move.held.every(Boolean)) {
      return { ok: false, error: 'Release at least one die to roll' };
    }
    return { ok: true };
  }

  if (state.dice.length === 0) return { ok: false, error: 'Roll the dice first' };
  const allowed = getAllowedCategories(state.dice, currentPlayer(state).scorecard);
  if (!allowed.includes(move.category)) return { ok: false, error: 'Category not available' };
  return { ok: true };
}

function applyMove(state: YatzyState, playerId: string, move: YatzyMove, rng: Rng): YatzyState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);

  if (move.type === 'hold') return { ...state, held: [...move.held] };

  if (move.type === 'roll') {
    const firstRoll = state.dice.length === 0;
    const held = firstRoll ? Array<boolean>(DICE_COUNT).fill(false) : move.held;
    const dice = Array.from({ length: DICE_COUNT }, (_, i) =>
      held[i] && !firstRoll ? (state.dice[i] as number) : rng.int(6) + 1,
    );
    return { ...state, dice, held, rollsLeft: state.rollsLeft - 1 };
  }

  const player = currentPlayer(state);
  const points = getScore(state.dice, move.category, player.scorecard);
  const bonus = earnsYatzyBonus(state.dice, player.scorecard) ? 1 : 0;
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex
      ? {
          ...p,
          scorecard: { ...p.scorecard, [move.category]: points },
          yatzyBonuses: p.yatzyBonuses + bonus,
        }
      : p,
  );

  const finished = players.every((p) => CATEGORIES.every((c) => p.scorecard[c] !== undefined));
  const nextIndex = (state.currentPlayerIndex + 1) % players.length;
  return {
    players,
    currentPlayerIndex: finished ? state.currentPlayerIndex : nextIndex,
    round: finished ? ROUNDS : nextIndex === 0 ? state.round + 1 : state.round,
    dice: [],
    held: Array<boolean>(DICE_COUNT).fill(false),
    rollsLeft: MAX_ROLLS,
    finished,
  };
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

function autoMove(state: YatzyState, _playerId: string, _rng: Rng): AutoMove<YatzyMove> {
  if (state.dice.length === 0) {
    return {
      move: { type: 'roll', held: Array<boolean>(DICE_COUNT).fill(false) },
      endsTurn: false,
    };
  }
  const scorecard = currentPlayer(state).scorecard;
  const allowed = getAllowedCategories(state.dice, scorecard);
  let best = allowed[0] as Category;
  let bestScore = -1;
  for (const c of [...allowed].sort((a, b) => DUMP_ORDER.indexOf(a) - DUMP_ORDER.indexOf(b))) {
    const s = getScore(state.dice, c, scorecard);
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
  defaultOptions: {},
  moveSchema: yatzyMoveSchema,
  isFreeMove: (move) => move.type === 'hold',
  createInitialState,
  validateMove,
  applyMove,
  // Dice and scorecards are public information: every player sees the full state.
  getPlayerView: (state) => state,
  getCurrentPlayers: (state) => (state.finished ? [] : [currentPlayer(state).id]),
  isGameOver: (state) => state.finished,
  getResults,
  autoMove,
};
