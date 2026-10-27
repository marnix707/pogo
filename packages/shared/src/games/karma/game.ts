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
  DECK_SIZE,
  JOKER_COUNT,
  JOKER_RANK,
  cardLabel,
  rankOf,
  shuffledDeck,
  suitOf,
} from './cards';
import type { Card } from './cards';
import { BIG_HAND_SIZE, HAND_SIZE, MAX_PLAYERS, MIN_PLAYERS, SLOTS } from './types';
import { KARMA_RULES, hasRule, ruleById, rulesIntroMs } from './rules';
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
  .max(DECK_SIZE + JOKER_COUNT - 1);

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
    z.object({ type: z.literal('skipReload') }),
    z.object({ type: z.literal('toggleRule'), rule: z.string().max(40) }),
    z.object({ type: z.literal('confirmRules') }),
    z.object({ type: z.literal('skipRules') }),
  ],
);

const optionsSchema = z
  .object({
    mode: z.enum(['normal', 'party', 'epic']).default('normal'),
    rules: z.array(z.string().max(40)).max(KARMA_RULES.length).default([]),
    round: z.number().int().min(1).max(999).default(1),
    pickerId: z.string().max(64).optional(),
  })
  .strict() as z.ZodType<KarmaOptions, z.ZodTypeDef, unknown>;

/** Cards in a full hand. */
export const handSizeFor = (rules: readonly string[] | undefined): number =>
  hasRule(rules, 'bigHand') ? BIG_HAND_SIZE : HAND_SIZE;

/**
 * The rules a game starts with: none, all of them (epic) or the ones earned so far (party). In epic the
 * jokers only join when more than two play (people + computers): with two they just mean "play again".
 */
export function rulesFor(options: KarmaOptions, seats: number): string[] {
  if (options.mode === 'epic')
    return KARMA_RULES.filter((r) => r.id !== 'jokers' || seats > 2).map((r) => r.id);
  if (options.mode === 'party') return options.rules.filter((id) => ruleById(id));
  return [];
}

const err = (error: string): MoveValidation => ({ ok: false, error });
const OK: MoveValidation = { ok: true };

// ---- rules helpers (exported for the UI) ----------------------------------------------------

/** The card the next play is measured against: the topmost card that is not a transparent 3 or joker. */
export function effectiveTop(pile: readonly Card[]): Card | undefined {
  for (let i = pile.length - 1; i >= 0; i--) {
    const rank = rankOf(pile[i] as Card);
    if (rank !== 3 && rank !== JOKER_RANK) return pile[i];
  }
  return undefined;
}

/**
 * Can a card of this rank be played on the pile?
 * - 2 and 10 can always be played (a 10 also burns the pile); anything may follow a 2. A joker
 *   can always be played too (it turns the direction of play around) and is invisible like a 3.
 * - A 3 is invisible: it can always be played and the card beneath it still counts
 *   (7, 3: the next player must still play 7 or lower). A pile of only 3s counts as empty.
 * - After a 7 the next card must be 7 or LOWER (the "lower than or equal" variant): 3-7, a 2 or a 10.
 * - Otherwise the card must be equal to or higher than the top card.
 */
export function canPlayRank(pile: readonly Card[], rank: number): boolean {
  if (rank === 2 || rank === 3 || rank === 10 || rank === JOKER_RANK) return true;
  const top = effectiveTop(pile);
  if (top === undefined) return true;
  const topRank = rankOf(top);
  if (topRank === 2) return true;
  if (topRank === 7) return rank <= 7;
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

/** Suits from lowest to highest for the opening: clubs, diamonds, hearts, spades (suitOf: 0 = spades ... 3 = clubs). */
const SUIT_ORDER = [3, 2, 1, 0];

/**
 * Who leads: the lowest ordinary card on the table (face-up cards and hands; 2, 3 and 10 are
 * specials and do not count): 4 first, then 5 and so on up to the ace. Equal ranks are decided by
 * suit: clubs, then diamonds, then hearts, then spades. With only specials around the first seat leads.
 */
export function findStarter(players: readonly KarmaPlayerState[]): number {
  let best: { seat: number; key: number } | null = null;
  players.forEach((p, seat) => {
    for (const card of [...p.hand, ...p.faceUp]) {
      if (card === null) continue;
      const rank = rankOf(card);
      if (rank === 2 || rank === 3 || rank === 10) continue;
      const key = rank * 4 + SUIT_ORDER.indexOf(suitOf(card));
      if (!best || key < best.key) best = { seat, key };
    }
  });
  return best ? (best as { seat: number }).seat : 0;
}

// ---- game -----------------------------------------------------------------------------------

/** Deals fresh hands for these players (shuffles with the injected Rng). */
function deal(playerIds: readonly string[], rules: readonly string[], rng: Rng) {
  const deck = shuffledDeck(rng, hasRule(rules, 'jokers'));
  const take = (n: number) => deck.splice(deck.length - n, n);
  const seats: KarmaPlayerState[] = playerIds.map((id) => ({
    id,
    faceDown: take(SLOTS),
    faceUp: take(SLOTS),
    hand: take(handSizeFor(rules)),
    ready: false,
    out: false,
  }));
  return { seats, stock: deck };
}

function createInitialState(players: GamePlayer[], options: KarmaOptions, rng: Rng): KarmaState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Karma needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  const rules = rulesFor(options, players.length);
  const ids = players.map((p) => p.id);
  // Party mode, round 2 and later: before anything is dealt, the winner of the last game sets the
  // rules (the hand size depends on them, so the cards are dealt when they confirm).
  const picker =
    options.mode === 'party' && options.round > 1
      ? (ids.find((id) => id === options.pickerId) ?? (ids[0] as string))
      : null;
  const dealt = picker
    ? {
        seats: ids.map((id): KarmaPlayerState => ({
          id,
          faceDown: [],
          faceUp: [],
          hand: [],
          ready: false,
          out: false,
        })),
        stock: [] as Card[],
      }
    : deal(ids, rules, rng);
  return {
    phase: picker ? 'pick' : 'swap',
    players: dealt.seats,
    stock: dealt.stock,
    pile: [],
    burned: 0,
    turn: 0,
    finishOrder: [],
    mustPickUp: false,
    eventSeq: 0,
    lastEvent: null,
    mode: options.mode,
    rules,
    pick: picker
      ? { playerId: picker, choices: KARMA_RULES.map((r) => r.id), changed: null, skip: false }
      : null,
    round: options.round,
    direction: 1,
    reload: null,
  };
}

function validateMove(state: KarmaState, playerId: string, move: KarmaMove): MoveValidation {
  if (state.phase === 'over') return err('The game is over');
  if (state.phase === 'pick') {
    if (move.type !== 'toggleRule' && move.type !== 'confirmRules' && move.type !== 'skipRules')
      return err('The rules are being chosen');
    if (state.pick?.playerId !== playerId) return err('Only the last winner sets the rules');
    if (move.type === 'skipRules') return OK;
    // Confirm needs a decision: one rule changed, or skip chosen.
    if (move.type === 'confirmRules')
      return state.pick.changed !== null || state.pick.skip
        ? OK
        : err('Change one rule, or choose to skip');
    return state.pick!.choices.includes(move.rule) ? OK : err('Pick one of the offered rules');
  }
  if (move.type === 'toggleRule' || move.type === 'confirmRules' || move.type === 'skipRules')
    return err('There are no rules to choose now');
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
  if (state.mustPickUp && move.type !== 'pickup') return err('Pick up the pile first');
  const zone = stateZone(me);

  if (state.reload) {
    // Fast reload: only a card of the rank just played, or skip.
    if (move.type === 'skipReload') return OK;
    if (move.type !== 'play') return err('Play the matching card or skip');
    if (move.cards.some((c) => rankOf(c) !== state.reload!.rank))
      return err('Only the matching card can be played now');
  } else if (move.type === 'skipReload') {
    return err('There is nothing to skip');
  }

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
      // Face-up cards may always be tried (like a blind card): a too-low one goes on the pile and
      // its owner has to pick the pile up. Only hand cards must be playable.
      if (zone === 'hand' && !canPlayRank(state.pile, rank))
        return err(
          rankOf(effectiveTop(state.pile) as Card) === 7
            ? 'After a 7 you must play 7 or lower, or a 2 or a 10'
            : 'Too low: play higher, or a 2 or a 10',
        );
      return OK;
    }
  }
}

function nextActive(state: KarmaState, from: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (((from + state.direction * step) % n) + n) % n;
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
    failed: false,
    out: false,
    skipped: [],
    echoed: false,
    ...extra,
  };
  state.lastEvent = ev;
  return ev;
}

/**
 * After a move: mark the player out if empty, end the game if one player is left, pass the turn.
 * `skips` is the number of 8s just played: each skips one player. You cannot skip yourself, so when
 * everyone else is skipped (always the case with two players) you simply go again. `jokers` is the
 * number of jokers just played (each reverses the direction of play).
 */
function advance(
  state: KarmaState,
  idx: number,
  ev: KarmaEvent,
  goAgain: boolean,
  skips = 0,
  jokers = 0,
) {
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
  // Jokers turn the direction around (one per joker); with only two players left that means you
  // play again, like an 8.
  if (jokers % 2 === 1) state.direction = state.direction === 1 ? -1 : 1;
  if ((goAgain || (jokers % 2 === 1 && remaining.length === 2)) && !me.out) {
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
  const below = effectiveTop(state.pile);
  state.pile.push(...cards);
  const rank = rankOf(cards[0] as Card);
  const burn = rank === 10 || quartetOnTop(state.pile);
  const handSize = handSizeFor(state.rules);
  const before = me.hand.length;
  while (me.hand.length < handSize && state.stock.length > 0)
    me.hand.push(state.stock.pop() as Card);
  const drawn = me.hand.slice(before);
  if (burn) {
    state.burned += state.pile.length;
    state.pile = [];
  }
  // An 8 skips the next player (a burn takes priority: the same player leads again anyway). With
  // "3 ate 8" a 3 repeats the 8 beneath it (3s in between do not hide it).
  const repeatsEight =
    rank === 3 && hasRule(state.rules, 'echoThree') && below !== undefined && rankOf(below) === 8;
  // (8s played earlier in a fast reload chain of this turn still count.)
  const pendingSkips = state.reload?.skips ?? 0;
  state.reload = null;
  const eights = pendingSkips + (!burn && (rank === 8 || repeatsEight) ? cards.length : 0);
  const jokers = rank === JOKER_RANK ? cards.length : 0;
  const ev = event(state, me.id, kind, cards, { burned: burn, echoed: repeatsEight && !burn });
  // Fast reload: a drawn card of the rank just played may be played too, before the turn passes.
  if (
    hasRule(state.rules, 'fastReload') &&
    kind === 'play' &&
    !burn &&
    rank !== JOKER_RANK &&
    drawn.some((c) => rankOf(c) === rank)
  ) {
    state.reload = { rank, skips: eights };
    return; // the same player is up again
  }
  advance(state, idx, ev, burn, eights, jokers);
}

function applyMove(state: KarmaState, playerId: string, move: KarmaMove, rng: Rng): KarmaState {
  return applyMoveInner(state, playerId, move, rng);
}

function applyMoveInner(
  state: KarmaState,
  playerId: string,
  move: KarmaMove,
  rng: Rng,
): KarmaState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);

  const s = structuredClone(state);
  if (move.type === 'toggleRule' || move.type === 'skipRules') {
    const pick = s.pick!;
    // Switch a rule: on becomes off, off becomes on.
    const flip = (rule: string) => {
      s.rules = s.rules.includes(rule) ? s.rules.filter((id) => id !== rule) : [...s.rules, rule];
    };
    // Only one rule can be changed: the earlier change is taken back first.
    if (pick.changed !== null) flip(pick.changed);
    if (move.type === 'skipRules') {
      // Choosing skip takes any change back; choosing it again deselects it.
      pick.skip = !pick.skip;
      pick.changed = null;
    } else {
      const same = pick.changed === move.rule;
      pick.changed = same ? null : move.rule;
      if (!same) flip(move.rule);
      pick.skip = false;
    }
    return s;
  }
  if (move.type === 'confirmRules') {
    // Now that the rules are known, deal the cards and start the swap phase.
    const dealt = deal(
      s.players.map((p) => p.id),
      s.rules,
      rng,
    );
    s.players = dealt.seats;
    s.stock = dealt.stock;
    s.phase = 'swap';
    s.pick = null;
    return s;
  }
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

    case 'skipReload': {
      const skips = s.reload?.skips ?? 0;
      s.reload = null;
      advance(s, idx, s.lastEvent as KarmaEvent, false, skips);
      return s;
    }

    case 'pickup': {
      const count = s.pile.length;
      me.hand.push(...s.pile);
      s.pile = [];
      s.mustPickUp = false;
      const ev = event(s, me.id, 'pickup', [], { pickedUp: count });
      advance(s, idx, ev, false);
      return s;
    }

    case 'play': {
      const source = stateZone(me) === 'hand' ? me.hand : me.faceUp;
      const tooLow = source !== me.hand && !canPlayRank(s.pile, rankOf(move.cards[0] as Card));
      for (const card of move.cards) {
        const at = source.indexOf(card);
        if (source === me.hand) me.hand.splice(at, 1);
        else me.faceUp[at] = null;
      }
      if (tooLow) {
        // A too-low face-up card is turned onto the pile like a failed blind card: pick the pile up.
        s.pile.push(...move.cards);
        s.mustPickUp = true;
        event(s, me.id, 'play', move.cards, { failed: true });
        return s;
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
        // Too low: the card lies on the pile for everyone to see and its owner must pick the whole
        // pile up (their next and only move), so the UI can show what happened first.
        s.pile.push(card);
        s.mustPickUp = true;
        event(s, me.id, 'blind', [card], { failed: true });
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
  // The game is decided: the player who is left shows everything they still hold (turned over in the UI).
  const decided = state.phase === 'over';
  const left = decided
    ? state.players.find((p) => !p.out && (p.hand.length > 0 || p.faceDown.some((c) => c !== null)))
    : undefined;
  return {
    phase: state.phase,
    players,
    stockCount: state.stock.length,
    pile: [...state.pile],
    burned: state.burned,
    turn: state.turn,
    finishOrder: [...state.finishOrder],
    mustPickUp: state.mustPickUp,
    lastEvent: state.lastEvent,
    mode: state.mode,
    rules: [...state.rules],
    pick: state.pick,
    round: state.round,
    direction: state.direction,
    reload: state.reload ? { rank: state.reload.rank } : null,
    leftovers: left
      ? { playerId: left.id, hand: [...left.hand], faceDown: [...left.faceDown] }
      : null,
  };
}

function getCurrentPlayers(state: KarmaState): string[] {
  if (state.phase === 'over') return [];
  if (state.phase === 'pick') return [state.pick!.playerId];
  if (state.phase === 'swap') return state.players.filter((p) => !p.ready).map((p) => p.id);
  return [state.players[state.turn]!.id];
}

function getResults(state: KarmaState): GameResults {
  const n = state.finishOrder.length;
  return {
    rankings: state.finishOrder.map((playerId, i) => ({ playerId, score: n - 1 - i, rank: i + 1 })),
  };
}

/** How valuable a card is lying face-up on the table (the computer swaps good ones up). */
function tableValue(card: Card): number {
  const rank = rankOf(card);
  if (rank === 10) return 20; // burns the pile
  if (rank === 2) return 19; // plays on anything
  return rank; // 3..9 low, J..A high
}

/** The hand/face-up swap that improves the table the most, if one is worth making. */
function bestSwap(me: KarmaPlayerState): { hand: Card; up: number } | null {
  let result: { hand: Card; up: number } | null = null;
  let bestGain = 1; // a swap must gain at least 2
  for (const hand of me.hand) {
    for (let slot = 0; slot < me.faceUp.length; slot++) {
      const up = me.faceUp[slot];
      if (up === null || up === undefined) continue;
      const gain = tableValue(hand) - tableValue(up);
      if (gain > bestGain) {
        bestGain = gain;
        result = { hand, up: slot };
      }
    }
  }
  return result;
}

/**
 * Sensible play for the computer and for absent / timed-out players: arrange a strong table while
 * swapping, then lowest legal rank first with specials last.
 */
function autoMove(state: KarmaState, playerId: string, rng: Rng): AutoMove<KarmaMove> {
  const me = state.players.find((p) => p.id === playerId)!;
  let move: KarmaMove;

  if (state.phase === 'pick') {
    // A computer, an absent player or a timeout keeps the rules as they are: skip, then confirm.
    move =
      state.pick!.changed === null && !state.pick!.skip
        ? { type: 'skipRules' }
        : { type: 'confirmRules' };
  } else if (state.phase === 'play' && state.reload) {
    // Fast reload (computer, absent player, timeout): play the matching cards.
    const match = me.hand.filter((c) => rankOf(c) === state.reload!.rank);
    move = match.length > 0 ? { type: 'play', cards: match } : { type: 'skipReload' };
  } else if (state.phase === 'swap') {
    const swap = bestSwap(me);
    move = swap ? { type: 'swap', ...swap } : { type: 'ready' };
  } else {
    const zone = stateZone(me);
    if (state.mustPickUp) {
      move = { type: 'pickup' };
    } else if (zone === 'down') {
      move = { type: 'playDown', index: me.faceDown.findIndex((c) => c !== null) };
    } else {
      const source = (zone === 'hand' ? me.hand : me.faceUp).filter((c): c is Card => c !== null);
      const ranks = [...new Set(source.map(rankOf))].filter((r) => canPlayRank(state.pile, r));
      // Specials are worth keeping: 3..9, J..A ascending, then 2, then 10.
      const priority = (r: number) => (r === JOKER_RANK ? 300 : r === 10 ? 200 : r === 2 ? 100 : r);
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
  defaultOptions: { mode: 'normal', rules: [], round: 1 },
  // The next game of the room: one round on, the rules as they were set (party), and the winner of
  // this game picks the rules of the next one before the cards are dealt.
  nextOptions: (state, options) => ({
    ...options,
    rules: state.mode === 'party' ? state.rules : options.rules,
    round: state.round + 1,
    pickerId: state.finishOrder[0],
  }),
  // Changing a rule is free: it does not restart the picker's clock.
  isFreeMove: (move) => move.type === 'toggleRule' || move.type === 'skipRules',
  // The swap phase has one clock for everybody: it starts with the phase and no swap or Ready (yours,
  // an opponent's or a computer's) resets it; when it runs out, everybody who is not ready is played.
  keepsClock: (before, after) => before.phase === 'swap' && after.phase === 'swap',
  // ...and it starts after the rules intro the clients play first (during the tutorial it runs).
  clockBonusMs: (state) =>
    state.phase === 'swap' && state.mode !== 'normal' ? rulesIntroMs(state.rules.length) : 0,
  moveSchema: karmaMoveSchema,
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
  settleMs: (state) => {
    const ev = state.lastEvent;
    if (!ev) return 0;
    // The client's reveal (turn + short hold) plus the beat it waits afterwards (KarmaGame SETTLE_MS).
    // Only face-down cards are turned over; a last card from hand or face-up needs no wait.
    if (ev.out && ev.kind === 'blind') return state.finishOrder[0] === ev.playerId ? 4980 : 3480;
    return ev.kind === 'blind' && !ev.out ? 3100 : 0; // turn 2.1s + flight to the pile 0.6s (WinReveal) + SETTLE_MS 0.4s
  },
  supportsBots: true,
};

export { cardLabel };
