import { z } from 'zod';
import type {
  AutoMove,
  GameDefinition,
  GamePlayer,
  GameResults,
  MoveValidation,
} from '../../game/types';
import type { Rng } from '../../game/rng';
import {
  canPlayCard,
  cardInfo,
  cardLabel,
  cardPoints,
  DECK_SIZE,
  freshDeck,
  isSpecial,
  isWild,
  shuffled,
} from './cards';
import type { Card, Color } from './cards';
import { HAND_SIZE, MAX_PLAYERS, MIN_PLAYERS } from './types';
import type {
  LastCardEvent,
  LastCardMove,
  LastCardOptions,
  LastCardPlayerState,
  LastCardState,
  LastCardView,
} from './types';

const cardSchema = z
  .number()
  .int()
  .min(0)
  .max(DECK_SIZE - 1);
const colorSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const lastCardMoveSchema: z.ZodType<LastCardMove, z.ZodTypeDef, unknown> =
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('play'),
      card: cardSchema,
      color: colorSchema.optional(),
      uno: z.boolean().optional(),
    }),
    z.object({ type: z.literal('draw') }),
    z.object({ type: z.literal('pass') }),
    z.object({ type: z.literal('lastcard') }),
  ]);

const optionsSchema = z.object({}).strict() as z.ZodType<LastCardOptions, z.ZodTypeDef, unknown>;

const topOf = (state: LastCardState): Card => state.pile[state.pile.length - 1]!;
const indexOf = (state: LastCardState, id: string): number =>
  state.players.findIndex((p) => p.id === id);

/** `steps` seats on from `from` in the current direction. */
function seatAfter(state: LastCardState, from: number, steps = 1): number {
  const n = state.players.length;
  return (((from + state.direction * steps) % n) + n) % n;
}

function clone(state: LastCardState): LastCardState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    stock: [...state.stock],
    pile: [...state.pile],
  };
}

/** Takes up to `count` cards from the deck into a hand; the discard pile is reshuffled when it runs out. */
function drawCards(state: LastCardState, index: number, count: number, rng: Rng): number {
  const hand = state.players[index]!.hand;
  let taken = 0;
  while (taken < count) {
    if (state.stock.length === 0) {
      const rest = state.pile.slice(0, -1);
      if (rest.length === 0) break;
      state.pile = [topOf(state)];
      state.stock = shuffled(rest, rng);
    }
    hand.push(state.stock.pop()!);
    taken++;
  }
  return taken;
}

function createInitialState(
  players: GamePlayer[],
  _options: LastCardOptions,
  rng: Rng,
): LastCardState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Last Card needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  const stock = freshDeck(rng);
  const seats: LastCardPlayerState[] = players.map((p) => ({ id: p.id, hand: [], called: false }));
  for (let i = 0; i < HAND_SIZE; i++) for (const seat of seats) seat.hand.push(stock.pop()!);
  // The game starts on a number card: action cards go back under the deck.
  const buried: Card[] = [];
  let first = stock.pop()!;
  while (isSpecial(first)) {
    buried.push(first);
    first = stock.pop()!;
  }
  stock.unshift(...buried);
  return {
    players: seats,
    stock,
    pile: [first],
    color: cardInfo(first).color!,
    turn: rng.int(seats.length),
    direction: 1,
    drawn: null,
    winner: null,
    eventSeq: 0,
    lastEvent: null,
    unoCall: null,
  };
}

function validateMove(state: LastCardState, playerId: string, move: LastCardMove): MoveValidation {
  if (state.winner) return { ok: false, error: 'The game is over' };
  const index = indexOf(state, playerId);
  if (index < 0) return { ok: false, error: 'You are not in this game' };
  const me = state.players[index]!;
  if (move.type === 'lastcard') {
    if (me.hand.length !== 1 || me.called)
      return { ok: false, error: 'You can only call UNO! with one card left' };
    return { ok: true };
  }
  if (index !== state.turn) return { ok: false, error: 'Not your turn' };
  switch (move.type) {
    case 'draw':
      return state.drawn !== null
        ? { ok: false, error: 'Play the card you drew, or pass' }
        : { ok: true };
    case 'pass':
      return state.drawn === null ? { ok: false, error: 'Draw a card first' } : { ok: true };
    case 'play': {
      if (!me.hand.includes(move.card))
        return { ok: false, error: 'That card is not in your hand' };
      if (state.drawn !== null && move.card !== state.drawn)
        return { ok: false, error: 'Play the card you drew, or pass' };
      if (!canPlayCard(move.card, topOf(state), state.color, me.hand)) {
        return {
          ok: false,
          error: isWild(move.card)
            ? 'Wild Draw Four only when you have no card of the current colour'
            : 'That card does not match the pile',
        };
      }
      if (me.hand.length === 1 && isSpecial(move.card))
        return { ok: false, error: 'You cannot finish with an action card: draw a card instead' };
      if (isWild(move.card) && move.color === undefined)
        return { ok: false, error: 'Choose a colour for the wild card' };
      return { ok: true };
    }
  }
}

function applyMove(
  prev: LastCardState,
  playerId: string,
  move: LastCardMove,
  rng: Rng,
): LastCardState {
  const check = validateMove(prev, playerId, move);
  if (!check.ok) throw new Error(check.error);
  const state = clone(prev);
  const index = indexOf(state, playerId);
  const me = state.players[index]!;
  const seq = prev.eventSeq + 1;
  state.eventSeq = seq;
  const event: LastCardEvent = {
    seq,
    playerId,
    kind: 'pass',
    card: null,
    color: null,
    drew: 0,
    victim: null,
    skipped: [],
    reversed: false,
    penalty: null,
    uno: false,
    out: false,
  };

  const callUno = () => {
    me.called = true;
    event.uno = true;
    state.unoCall = { seq, playerId };
  };

  if (move.type === 'lastcard') {
    event.kind = 'lastcard';
    callUno();
  } else if (move.type === 'draw') {
    event.kind = 'draw';
    event.drew = drawCards(state, index, 1, rng);
    const card = me.hand[me.hand.length - 1]!;
    if (event.drew > 0 && canPlayCard(card, topOf(state), state.color, me.hand)) {
      state.drawn = card; // may be played; the turn stays
    } else {
      state.turn = seatAfter(state, index);
    }
  } else if (move.type === 'pass') {
    state.drawn = null;
    state.turn = seatAfter(state, index);
  } else {
    event.kind = 'play';
    event.card = move.card;
    me.hand.splice(me.hand.indexOf(move.card), 1);
    state.pile.push(move.card);
    state.drawn = null;
    const info = cardInfo(move.card);
    state.color = info.color ?? (move.color as Color);
    event.color = state.color;

    // Somebody who stayed on one card without pressing UNO! pays for it as soon as another card is thrown.
    state.players.forEach((other, i) => {
      if (i !== index && other.hand.length === 1 && !other.called) {
        drawCards(state, i, 1, rng);
        event.penalty = other.id;
      }
    });

    if (me.hand.length === 1 && move.uno) callUno();
    if (me.hand.length === 0) {
      state.winner = playerId;
      event.out = true;
    } else {
      const next = seatAfter(state, index);
      const penalise = (victim: number, count: number) => {
        const got = drawCards(state, victim, count, rng);
        event.victim = { playerId: state.players[victim]!.id, count: got };
        event.skipped = [state.players[victim]!.id];
      };
      switch (info.kind) {
        case 'skip':
          event.skipped = [state.players[next]!.id];
          state.turn = seatAfter(state, index, 2);
          break;
        case 'reverse':
          state.direction = (state.direction === 1 ? -1 : 1) as 1 | -1;
          event.reversed = true;
          // With two players a reverse is a skip: you play again.
          state.turn = state.players.length === 2 ? index : seatAfter(state, index);
          break;
        case 'draw2':
          penalise(next, 2);
          state.turn = seatAfter(state, index, 2);
          break;
        case 'wild4':
          penalise(next, 4);
          state.turn = seatAfter(state, index, 2);
          break;
        default:
          state.turn = next;
      }
    }
  }
  // Pressing UNO! only counts while exactly one card is left.
  for (const p of state.players) if (p.hand.length !== 1) p.called = false;
  state.lastEvent = event;
  return state;
}

function getCurrentPlayers(state: LastCardState): string[] {
  return state.winner ? [] : [state.players[state.turn]!.id];
}

function getResults(state: LastCardState): GameResults {
  const points = (p: LastCardPlayerState) => p.hand.reduce((sum, c) => sum + cardPoints(c), 0);
  const losers = state.players
    .filter((p) => p.id !== state.winner)
    .map((p) => ({ id: p.id, points: points(p) }))
    .sort((a, b) => a.points - b.points);
  const n = state.players.length;
  const rankings = [{ playerId: state.winner!, score: n - 1, rank: 1 }];
  losers.forEach((l, i) => {
    const before = losers.slice(0, i).filter((o) => o.points < l.points).length;
    const rank = 2 + before;
    rankings.push({ playerId: l.id, score: n - rank, rank });
  });
  return { rankings };
}

function getPlayerView(state: LastCardState, playerId: string): LastCardView {
  const me = state.players.find((p) => p.id === playerId);
  const current = state.players[state.turn]!;
  return {
    phase: state.winner ? 'over' : 'play',
    players: state.players.map((p) => ({ id: p.id, count: p.hand.length, called: p.called })),
    hand: me ? [...me.hand] : [],
    top: topOf(state),
    below: state.pile.slice(-4, -1),
    color: state.color,
    stockCount: state.stock.length,
    turn: state.turn,
    direction: state.direction,
    drawn: current.id === playerId ? state.drawn : null,
    mustCall: !!me && me.hand.length === 1 && !me.called && !state.winner,
    winner: state.winner,
    lastEvent: state.lastEvent,
    unoCall: state.unoCall,
  };
}

/** The colour the player holds most of (what the computer picks for a wild). */
function bestColor(hand: readonly Card[], rng: Rng): Color {
  const counts = [0, 0, 0, 0];
  for (const c of hand) {
    const color = cardInfo(c).color;
    if (color !== null) counts[color]!++;
  }
  const max = Math.max(...counts);
  const best = counts.flatMap((n, i) => (n === max ? [i] : []));
  return best[rng.int(best.length)] as Color;
}

/** Computer players (and timed-out or absent humans): plays sensibly, calls UNO!, keeps wilds for later. */
function autoMove(state: LastCardState, playerId: string, rng: Rng): AutoMove<LastCardMove> {
  const index = indexOf(state, playerId);
  const me = state.players[index]!;
  const endsTurn = (move: LastCardMove) => {
    const after = applyMove(state, playerId, move, rng);
    return !!after.winner || after.turn !== index || after.eventSeq === state.eventSeq;
  };
  const candidates = (state.drawn !== null ? [state.drawn] : me.hand).filter(
    (c) => validateMove(state, playerId, { type: 'play', card: c, color: 0 }).ok,
  );
  if (candidates.length === 0) {
    const move: LastCardMove = state.drawn !== null ? { type: 'pass' } : { type: 'draw' };
    return { move, endsTurn: move.type === 'pass' ? true : endsTurn(move) };
  }
  // Coloured cards first (action cards before plain numbers: they hurt the others), wilds last.
  const score = (c: Card) => {
    const kind = cardInfo(c).kind;
    return kind === 'wild' ? 0 : kind === 'wild4' ? -1 : kind === 'number' ? 2 : 3;
  };
  const best = Math.max(...candidates.map(score));
  const pool = candidates.filter((c) => score(c) === best);
  const card = pool[rng.int(pool.length)]!;
  const rest = me.hand.filter((_, i) => i !== me.hand.indexOf(card));
  const move: LastCardMove = {
    type: 'play',
    card,
    ...(isWild(card) ? { color: bestColor(rest, rng) } : {}),
    ...(me.hand.length === 2 ? { uno: true } : {}),
  };
  return { move, endsTurn: endsTurn(move) };
}

export const lastCardGame: GameDefinition<
  LastCardState,
  LastCardMove,
  LastCardOptions,
  LastCardView
> = {
  id: 'lastcard',
  name: 'Last Card',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  defaultOptions: {},
  moveSchema: lastCardMoveSchema,
  // Calling UNO! is allowed out of turn and must not buy anybody more time.
  isFreeMove: (move) => move.type === 'lastcard',
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getCurrentPlayers,
  isGameOver: (state) => state.winner !== null,
  getResults,
  autoMove,
  // Somebody left on one card without UNO! gets a moment to press it before a computer throws a card.
  settleMs: (state) =>
    state.players.some(
      (p) => p.hand.length === 1 && !p.called && p.id !== state.players[state.turn]!.id,
    )
      ? 2200
      : 0,
  supportsBots: true,
};

export { cardLabel };
