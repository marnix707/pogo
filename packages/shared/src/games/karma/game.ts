import { z } from 'zod';
import type {
  AutoMove,
  GameDefinition,
  GamePlayer,
  GameResults,
  MoveValidation,
} from '../../game/types';
import type { Rng } from '../../game/rng';
import { DECK_SIZE, cardLabel, rankOf, shuffledDeck } from './cards';
import type { Card } from './cards';
import { HAND_SIZE, MAX_PLAYERS, MIN_PLAYERS, SLOTS } from './types';
import type {
  KarmaEvent,
  KarmaMove,
  KarmaOptions,
  KarmaPlayerState,
  KarmaPlayerView,
  KarmaState,
  KarmaView,
} from './types';

const cardSchema = z
  .number()
  .int()
  .min(0)
  .max(DECK_SIZE - 1);

export const karmaMoveSchema: z.ZodType<KarmaMove, z.ZodTypeDef, unknown> = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('swap'),
      hand: cardSchema,
      up: z
        .number()
        .int()
        .min(0)
        .max(SLOTS - 1),
    }),
    z.object({ type: z.literal('ready') }),
    z.object({ type: z.literal('play'), cards: z.array(cardSchema).min(1).max(4) }),
    z.object({
      type: z.literal('playDown'),
      index: z
        .number()
        .int()
        .min(0)
        .max(SLOTS - 1),
    }),
    z.object({ type: z.literal('pickup') }),
  ],
);

const optionsSchema = z.object({}).strict() as z.ZodType<KarmaOptions, z.ZodTypeDef, unknown>;

const err = (error: string): MoveValidation => ({ ok: false, error });
const OK: MoveValidation = { ok: true };

// ---- rules helpers (exported for the UI) ----------------------------------------------------

/**
 * Can a card of this rank be played on the pile?
 * - 2 and 10 can always be played (a 10 also burns the pile); anything may follow a 2.
 * - After a 7 the next card must be LOWER than 7 (the "lower than" variant): 3-6, a 2 or a 10.
 * - Otherwise the card must be equal to or higher than the top card.
 */
export function canPlayRank(pile: readonly Card[], rank: number): boolean {
  if (rank === 2 || rank === 10) return true;
  const top = pile[pile.length - 1];
  if (top === undefined) return true;
  const topRank = rankOf(top);
  if (topRank === 2) return true;
  if (topRank === 7) return rank < 7;
  return rank >= topRank;
}

/** Four of a kind on top of the pile burns it. */
function quartetOnTop(pile: readonly Card[]): boolean {
  if (pile.length < 4) return false;
  const top = rankOf(pile[pile.length - 1] as Card);
  return pile.slice(-4).every((c) => rankOf(c) === top);
}

type Zone = 'hand' | 'up' | 'down' | 'none';

/** Which cards a player must play from right now: hand first, then face-up, then face-down. */
export function activeZone(player: {
  hand?: readonly Card[] | null;
  handCount?: number;
  faceUp: readonly (Card | null)[];
  faceDown: readonly (Card | null | boolean)[];
}): Zone {
  const handSize = player.hand ? player.hand.length : (player.handCount ?? 0);
  if (handSize > 0) return 'hand';
  if (player.faceUp.some((c) => c !== null)) return 'up';
  if (player.faceDown.some((c) => c !== null && c !== false)) return 'down';
  return 'none';
}

const stateZone = (p: KarmaPlayerState): Zone => activeZone(p);

/** Who leads: lowest rank (from 3 up) showing in a face-up slot, else in a hand; ties go to the earlier seat. */
export function findStarter(players: readonly KarmaPlayerState[]): number {
  for (let rank = 3; rank <= 14; rank++) {
    const up = players.findIndex((p) => p.faceUp.some((c) => c !== null && rankOf(c) === rank));
    if (up >= 0) return up;
    const inHand = players.findIndex((p) => p.hand.some((c) => rankOf(c) === rank));
    if (inHand >= 0) return inHand;
  }
  return 0;
}

// ---- game -----------------------------------------------------------------------------------

function createInitialState(players: GamePlayer[], _options: KarmaOptions, rng: Rng): KarmaState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Karma needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  const deck = shuffledDeck(rng);
  const take = (n: number) => deck.splice(deck.length - n, n);
  const seats: KarmaPlayerState[] = players.map((p) => ({
    id: p.id,
    faceDown: take(SLOTS),
    faceUp: take(SLOTS),
    hand: take(HAND_SIZE),
    ready: false,
    out: false,
  }));
  return {
    phase: 'swap',
    players: seats,
    stock: deck,
    pile: [],
    burned: 0,
    turn: 0,
    finishOrder: [],
    eventSeq: 0,
    lastEvent: null,
  };
}

function validateMove(state: KarmaState, playerId: string, move: KarmaMove): MoveValidation {
  if (state.phase === 'over') return err('The game is over');
  const idx = state.players.findIndex((p) => p.id === playerId);
  const me = state.players[idx];
  if (!me) return err('You are not in this game');

  if (state.phase === 'swap') {
    if (move.type === 'ready') return me.ready ? err('You are already ready') : OK;
    if (move.type !== 'swap') return err('Swap cards and press Ready first');
    if (me.ready) return err('You are ready: no more swaps');
    if (!me.hand.includes(move.hand)) return err('That card is not in your hand');
    if (me.faceUp[move.up] == null) return err('Pick one of your face-up cards');
    return OK;
  }

  if (state.turn !== idx) return err('Not your turn');
  const zone = stateZone(me);

  switch (move.type) {
    case 'swap':
    case 'ready':
      return err('The swap phase is over');

    case 'pickup':
      return state.pile.length === 0 ? err('There is nothing to pick up') : OK;

    case 'playDown': {
      if (zone !== 'down') return err('Play your hand and face-up cards first');
      return me.faceDown[move.index] == null ? err('There is no card there') : OK;
    }

    case 'play': {
      if (zone === 'down') return err('Pick one of your face-down cards');
      const source = zone === 'hand' ? me.hand : me.faceUp;
      if (new Set(move.cards).size !== move.cards.length) return err('Pick each card once');
      for (const card of move.cards) {
        if (!source.includes(card)) {
          return err(zone === 'hand' ? 'Play your hand cards first' : 'That card is not available');
        }
      }
      const rank = rankOf(move.cards[0] as Card);
      if (move.cards.some((c) => rankOf(c) !== rank)) return err('Play cards of the same rank');
      if (!canPlayRank(state.pile, rank))
        return err(
          rankOf(state.pile[state.pile.length - 1] as Card) === 7
            ? 'After a 7 you must play lower, or a 2 or a 10'
            : 'Too low: play higher, or a 2 or a 10',
        );
      return OK;
    }
  }
}

function nextActive(state: KarmaState, from: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    if (!state.players[idx]!.out) return idx;
  }
  return from;
}

function event(
  state: KarmaState,
  playerId: string,
  kind: KarmaEvent['kind'],
  cards: Card[],
  extra: Partial<KarmaEvent> = {},
): KarmaEvent {
  state.eventSeq += 1;
  const ev: KarmaEvent = {
    seq: state.eventSeq,
    playerId,
    kind,
    cards,
    burned: false,
    pickedUp: 0,
    out: false,
    skipped: [],
    ...extra,
  };
  state.lastEvent = ev;
  return ev;
}

/**
 * After a move: mark the player out if empty, end the game if one player is left, pass the turn.
 * `skips` is the number of 8s just played: each skips one player. You cannot skip yourself, so when
 * everyone else is skipped (always the case with two players) you simply go again.
 */
function advance(state: KarmaState, idx: number, ev: KarmaEvent, goAgain: boolean, skips = 0) {
  const me = state.players[idx]!;
  if (
    me.hand.length === 0 &&
    me.faceUp.every((c) => c === null) &&
    me.faceDown.every((c) => c === null)
  ) {
    me.out = true;
    ev.out = true;
    state.finishOrder.push(me.id);
  }
  const remaining = state.players.filter((p) => !p.out);
  if (remaining.length <= 1) {
    for (const p of remaining) state.finishOrder.push(p.id); // the loser comes last
    state.phase = 'over';
    return;
  }
  if (goAgain && !me.out) {
    state.turn = idx;
    return;
  }
  const othersActive = remaining.filter((p) => p.id !== me.id).length;
  // A finished player has no turn to "go again" on, so somebody must still get to play after the skips.
  const skipCount = Math.min(skips, me.out ? Math.max(0, othersActive - 1) : othersActive);
  let next = nextActive(state, idx);
  for (let i = 0; i < skipCount; i++) {
    ev.skipped.push(state.players[next]!.id);
    next = nextActive(state, next);
  }
  state.turn = next;
}

/** Put cards on the pile, apply 10 / quartet burning, refill the hand and move on. */
function playToPile(state: KarmaState, idx: number, cards: Card[], kind: 'play' | 'blind') {
  const me = state.players[idx]!;
  state.pile.push(...cards);
  const burn = rankOf(cards[0] as Card) === 10 || quartetOnTop(state.pile);
  while (me.hand.length < HAND_SIZE && state.stock.length > 0)
    me.hand.push(state.stock.pop() as Card);
  if (burn) {
    state.burned += state.pile.length;
    state.pile = [];
  }
  // An 8 skips the next player (a burn takes priority: the same player leads again anyway).
  const eights = !burn && rankOf(cards[0] as Card) === 8 ? cards.length : 0;
  const ev = event(state, me.id, kind, cards, { burned: burn });
  advance(state, idx, ev, burn, eights);
}

function applyMove(state: KarmaState, playerId: string, move: KarmaMove, _rng: Rng): KarmaState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);

  const s = structuredClone(state);
  const idx = s.players.findIndex((p) => p.id === playerId);
  const me = s.players[idx]!;

  switch (move.type) {
    case 'swap': {
      const handIdx = me.hand.indexOf(move.hand);
      const upCard = me.faceUp[move.up] as Card;
      me.hand[handIdx] = upCard;
      me.faceUp[move.up] = move.hand;
      return s;
    }

    case 'ready': {
      me.ready = true;
      if (s.players.every((p) => p.ready)) {
        s.phase = 'play';
        s.turn = findStarter(s.players);
      }
      return s;
    }

    case 'pickup': {
      const count = s.pile.length;
      me.hand.push(...s.pile);
      s.pile = [];
      const ev = event(s, me.id, 'pickup', [], { pickedUp: count });
      advance(s, idx, ev, false);
      return s;
    }

    case 'play': {
      const source = stateZone(me) === 'hand' ? me.hand : me.faceUp;
      for (const card of move.cards) {
        const at = source.indexOf(card);
        if (source === me.hand) me.hand.splice(at, 1);
        else me.faceUp[at] = null;
      }
      playToPile(s, idx, move.cards, 'play');
      return s;
    }

    case 'playDown': {
      const card = me.faceDown[move.index] as Card;
      me.faceDown[move.index] = null;
      if (canPlayRank(s.pile, rankOf(card))) {
        playToPile(s, idx, [card], 'blind');
      } else {
        // Too low: the card joins the pile and the whole pile goes to the hand.
        s.pile.push(card);
        const count = s.pile.length;
        me.hand.push(...s.pile);
        s.pile = [];
        const ev = event(s, me.id, 'blind', [card], { pickedUp: count });
        advance(s, idx, ev, false);
      }
      return s;
    }
  }
}

function getPlayerView(state: KarmaState, playerId: string): KarmaView {
  const players: KarmaPlayerView[] = state.players.map((p) => ({
    id: p.id,
    handCount: p.hand.length,
    hand: p.id === playerId ? [...p.hand] : null,
    faceUp: [...p.faceUp],
    faceDown: p.faceDown.map((c) => c !== null),
    ready: p.ready,
    out: p.out,
  }));
  return {
    phase: state.phase,
    players,
    stockCount: state.stock.length,
    pile: [...state.pile],
    burned: state.burned,
    turn: state.turn,
    finishOrder: [...state.finishOrder],
    lastEvent: state.lastEvent,
  };
}

function getCurrentPlayers(state: KarmaState): string[] {
  if (state.phase === 'over') return [];
  if (state.phase === 'swap') return state.players.filter((p) => !p.ready).map((p) => p.id);
  return [state.players[state.turn]!.id];
}

function getResults(state: KarmaState): GameResults {
  const n = state.finishOrder.length;
  return {
    rankings: state.finishOrder.map((playerId, i) => ({ playerId, score: n - 1 - i, rank: i + 1 })),
  };
}

/** Cheap, sensible play for absent / timed-out players: lowest legal rank first, specials last. */
function autoMove(state: KarmaState, playerId: string, rng: Rng): AutoMove<KarmaMove> {
  const me = state.players.find((p) => p.id === playerId)!;
  let move: KarmaMove;

  if (state.phase === 'swap') {
    move = { type: 'ready' };
  } else {
    const zone = stateZone(me);
    if (zone === 'down') {
      move = { type: 'playDown', index: me.faceDown.findIndex((c) => c !== null) };
    } else {
      const source = (zone === 'hand' ? me.hand : me.faceUp).filter((c): c is Card => c !== null);
      const ranks = [...new Set(source.map(rankOf))].filter((r) => canPlayRank(state.pile, r));
      // Specials are worth keeping: 3..9, J..A ascending, then 2, then 10.
      const priority = (r: number) => (r === 10 ? 200 : r === 2 ? 100 : r);
      ranks.sort((a, b) => priority(a) - priority(b));
      // Always playing the very lowest card can circle forever (a 7 that nobody can follow is picked up
      // and led again, round and round). A little randomness breaks such cycles: 0 stuck games in
      // 2000 simulated, versus ~1 in 500 without it. Only drawn when there is a real choice.
      const best = ranks.length > 1 && rng.int(4) === 0 ? ranks[1] : ranks[0];
      move =
        best === undefined
          ? { type: 'pickup' }
          : { type: 'play', cards: source.filter((c) => rankOf(c) === best) };
    }
  }

  const after = applyMove(state, playerId, move, rng);
  const stillMyTurn = after.phase !== 'over' && getCurrentPlayers(after).includes(playerId);
  return { move, endsTurn: !stillMyTurn };
}

export const karmaGame: GameDefinition<KarmaState, KarmaMove, KarmaOptions, KarmaView> = {
  id: 'karma',
  name: 'Karma',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  defaultOptions: {},
  moveSchema: karmaMoveSchema,
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
};

export { cardLabel };
