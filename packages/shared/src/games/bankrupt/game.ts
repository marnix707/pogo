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
import { DEFAULT_BOARD, isOwnable } from './config';
import type { BoardConfig, OwnableTile, PropertyTile } from './config';
import {
  alivePlayers,
  buildingRefund,
  buildingsOf,
  holdingsOf,
  mover,
  netWorth,
  groupOf,
  ownsSet,
  rainbowRoad,
  playerOf,
  PLAYER_COLOURS,
  rentOf,
  stepsBetween,
  tileById,
  tileIndex,
} from './rules';
import { MAX_PLAYERS, MIN_PLAYERS, TARGETS, TURN_LIMITS } from './types';
import type {
  BankruptMove,
  BankruptOptions,
  BankruptPlayer,
  CardKind,
  BankruptState,
  BankruptView,
} from './types';

/** Milliseconds the screen needs to show the dice and one step of a token. */
/** The wheel spins about 2.6 s and flashes its slice for the rest (the screen and the computers wait this long). */
export const ROLL_MS = 3000;
/** The normal wheel: the die's six numbers twice round. */
export const WHEEL_SLICES = ['1', '2', '3', '4', '5', '6', '1', '2', '3', '4', '5', '6'] as const;
/** The special wheel: also $50 and JAIL. */
export const SPECIAL_SLICES = [
  '1',
  '2',
  '$50',
  '3',
  '4',
  '5',
  '6',
  'JAIL',
  '1',
  '2',
  '3',
  '4',
] as const;
export const WHEEL_CASH = 50;
/** Three sixes in a row: the fourth roll is the special wheel. */
export const SIXES_FOR_WHEEL = 3;
export const STEP_MS = 360;
/** The smallest bid, and the step bots bid in. */
export const MIN_BID = 10;
/** Seconds to bid in an auction before everybody who has not bid steps out. */
export const AUCTION_SEC = 15;
/** An auction of a space somebody did not buy opens at this share of its price at least. */
export const AUCTION_MIN_PCT = 70;
const ceil5 = (n: number) => Math.ceil(n / 5) * 5;
/** The lowest opening bid for a space. */
export const openingBid = (price: number) =>
  Math.max(MIN_BID, ceil5((price * AUCTION_MIN_PCT) / 100));
const round5 = (n: number) => Math.round(n / 5) * 5;
/** The smallest raise in an auction (the left bid button) scales with the space's price: $5 for the cheap ones up to
 * $20 for the dearest (about 4.5 % of the price, in steps of 5). The other buttons are 2 x and 5 x that. */
export const bidStep = (price: number) => Math.min(20, Math.max(5, round5(price / 22.5)));
/** Seconds a trade on the Auction corner may take (the offers, and the choice). */
export const TRADE_SEC = 90;
/** Free Froggo: what each of the other players pays to bail a jailed player out, and the seconds they get to answer. */
export const FREE_FROGGO_BAIL = 50;
export const BAIL_SEC = 15;
/** A luck card slides in (CARD_SLIDE_MS), stays CARD_SHOW_MS, slides away; only then does it take effect on screen. */
export const CARD_SLIDE_MS = 450;
export const CARD_SHOW_MS = 2000;

const optionsSchema: z.ZodType<BankruptOptions, z.ZodTypeDef, unknown> = z
  .object({
    target: z
      .number()
      .int()
      .refine((n) => (TARGETS as readonly number[]).includes(n))
      .default(5000),
    turns: z
      .number()
      .int()
      .refine((n) => (TURN_LIMITS as readonly number[]).includes(n))
      .default(0),
    auctionOnDecline: z.boolean().default(true),
    rainbowRoad: z.boolean().default(false),
    freeFroggo: z.boolean().default(false),
    specialWheel: z.boolean().default(true),
  })
  .strict();

const tileKey = z.string().min(1).max(30);
export const bankruptMoveSchema: z.ZodType<BankruptMove, z.ZodTypeDef, unknown> =
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('roll') }),
    z.object({ type: z.literal('buy') }),
    z.object({ type: z.literal('decline') }),
    z.object({ type: z.literal('payJail') }),
    z.object({ type: z.literal('wait') }),
    z.object({ type: z.literal('build'), tile: tileKey }),
    z.object({ type: z.literal('sellBuilding'), tile: tileKey }),
    z.object({ type: z.literal('sellProperty'), tile: tileKey }),
    z.object({ type: z.literal('bid'), amount: z.number().int().min(1).max(1_000_000) }),
    z.object({ type: z.literal('passBid') }),
    z.object({ type: z.literal('tradePick'), tile: tileKey }),
    z.object({ type: z.literal('tradeOffer'), tile: tileKey }),
    z.object({ type: z.literal('tradePass') }),
    z.object({ type: z.literal('tradeAccept'), from: z.string().min(1).max(64) }),
    z.object({ type: z.literal('tradeCancel') }),
    z.object({ type: z.literal('rainbow') }),
    z.object({ type: z.literal('bailPay') }),
    z.object({ type: z.literal('bailRefuse') }),
  ]);

const OK: MoveValidation = { ok: true };
const err = (error: string): MoveValidation => ({ ok: false, error });

function createInitialState(
  players: GamePlayer[],
  options: BankruptOptions,
  rng: Rng,
): BankruptState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
    throw new Error(`Bankrupt needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  const board = DEFAULT_BOARD;
  // Seat order is random; the later you sit, the more you start with.
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    board,
    options,
    players: order.map((p, i) => ({
      id: p.id,
      // (the colour the player picked in the lobby; else their place in the list)
      colour:
        PLAYER_COLOURS.indexOf(p.choice as (typeof PLAYER_COLOURS)[number]) >= 0
          ? PLAYER_COLOURS.indexOf(p.choice as (typeof PLAYER_COLOURS)[number])
          : players.findIndex((q) => q.id === p.id),
      cash: board.startCash + i * board.startCashStep,
      pos: 0,
      jail: 0,
      bankrupt: false,
      bot: !!p.bot,
      wheel: false,
      bailAsked: false,
      outAt: 0,
    })),
    owned: {},
    turn: 0,
    round: 1,
    phase: 'roll',
    sixes: 0,
    dice: null,
    auction: null,
    trade: null,
    bail: null,
    deck: shuffled(cardPack(board, options).length, rng),
    events: [],
    seq: 0,
    winner: null,
  };
}

// ---- helpers on a mutable draft -----------------------------------------------------------------

/** The cards that are in the pack for these options (the fortunate-wheel card only with the Special wheel option). */
const cardPack = (board: BoardConfig, options: BankruptOptions) =>
  board.cards.filter((c) => c.effect.type !== 'wheel' || options.specialWheel);

/** A shuffled deck of `n` cards (Fisher-Yates): the indexes 0..n-1 in random order. */
function shuffled(n: number, rng: Rng): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

function draft(s: BankruptState): BankruptState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
    owned: Object.fromEntries(Object.entries(s.owned).map(([k, v]) => [k, { ...v }])),
    auction: s.auction
      ? { ...s.auction, passed: [...s.auction.passed], bids: { ...s.auction.bids } }
      : null,
    trade: s.trade ? { ...s.trade, offers: { ...s.trade.offers } } : null,
    deck: [...s.deck],
    bail: s.bail ? { ...s.bail, voters: [...s.bail.voters], accepted: [...s.bail.accepted] } : null,
    events: [],
    seq: s.seq + 1,
  };
}

const ownable = (s: BankruptState, id: string): OwnableTile | undefined => {
  const t = tileById(s.board, id);
  return t && isOwnable(t) ? t : undefined;
};

/** Players who may still bid: alive and not stepped out. */
const bidders = (s: BankruptState) =>
  s.auction ? alivePlayers(s).filter((p) => !s.auction!.passed.includes(p.id)) : [];

function declareBankrupt(s: BankruptState, p: BankruptPlayer) {
  if (p.bankrupt) return;
  p.bankrupt = true;
  p.outAt = s.players.filter((x) => x.bankrupt).length;
  for (const [tile, h] of Object.entries(s.owned)) if (h.owner === p.id) delete s.owned[tile];
  s.events.push({ k: 'bankrupt', by: p.id });
  if (s.trade && (s.trade.by === p.id || p.id in s.trade.offers)) endTrade(s, false);
}

/** Cash below the floor is bankrupt. */
function checkBankrupt(s: BankruptState, p: BankruptPlayer) {
  if (!p.bankrupt && p.cash < s.board.bankruptBelow) declareBankrupt(s, p);
}

/** Move money between players (null = the bank). */
function pay(
  s: BankruptState,
  from: BankruptPlayer | null,
  to: BankruptPlayer | null,
  amount: number,
) {
  if (from) {
    from.cash -= amount;
    checkBankrupt(s, from);
  }
  if (to) to.cash += amount;
}

/** Pay the fee or sit it out: only a question when there is the money for the fee, else the turn just ends. */
const jailChoice = (s: BankruptState, p: BankruptPlayer) =>
  p.cash >= s.board.jailFee ? 'jailAsk' : 'after';

function sendToJail(s: BankruptState, p: BankruptPlayer) {
  p.pos = tileIndex(s.board, s.board.tiles.find((t) => t.kind === 'jail')!.id);
  p.jail = s.board.jailTurns;
  p.bailAsked = false; // (a new stay: Free Froggo may be put to the others once more)
  s.sixes = 0;
  s.events.push({ k: 'jail', by: p.id });
}

/** The next seat that is still playing (a new round when the order wraps). */
function nextSeat(s: BankruptState) {
  const n = s.players.length;
  const from = s.turn;
  let i = from;
  do i = (i + 1) % n;
  while (s.players[i]!.bankrupt && i !== from);
  // Passing the last seat back to the first starts a new round.
  if (i <= from) s.round += 1;
  s.turn = i;
}

/** A jailed player's turn is sat out. */
function skipJailTurn(s: BankruptState, p: BankruptPlayer) {
  p.jail -= 1;
  s.events.push({ k: 'jailSkip', by: p.id, left: p.jail });
  if (p.jail === 0) s.events.push({ k: 'free', by: p.id });
}

/** Free Froggo: ask everybody else to pay the bail, when the switch is on and all of them can afford it. */
function startBailVote(s: BankruptState, p: BankruptPlayer): boolean {
  if (!s.options.freeFroggo || p.bailAsked) return false; // (once per stay in jail)
  const voters = alivePlayers(s).filter((x) => x.id !== p.id);
  if (voters.length === 0 || voters.some((v) => v.cash < FREE_FROGGO_BAIL)) return false;
  p.bailAsked = true;
  s.bail = {
    subject: p.id,
    amount: FREE_FROGGO_BAIL,
    voters: voters.map((v) => v.id),
    accepted: [],
  };
  s.phase = 'bail';
  return true;
}

/** The turn is with `s.turn`: jailed players sit it out (unless the others bail them out), else it is theirs to play. */
function settleTurn(s: BankruptState) {
  const n = s.players.length;
  for (let guard = 0; guard < n * 4; guard++) {
    const p = s.players[s.turn]!;
    if (p.jail === 0) break;
    if (startBailVote(s, p)) return; // the others decide first (see the `bailPay` / `bailRefuse` moves)
    skipJailTurn(s, p);
    nextSeat(s);
  }
  s.phase = 'roll';
  s.sixes = 0;
  if (s.options.turns > 0 && s.round > s.options.turns) {
    s.round = s.options.turns;
    endGame(s);
  }
}

/** After a turn-ending situation: who is next (a new round when the order wraps), or the game is over. */
function advanceTurn(s: BankruptState) {
  nextSeat(s);
  settleTurn(s);
}

function endGame(s: BankruptState) {
  const alive = alivePlayers(s);
  const best = [...alive].sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0];
  s.winner = best?.id ?? null;
  s.phase = 'over';
  s.auction = null;
}

function checkWin(s: BankruptState) {
  if (s.phase === 'over') return;
  const alive = alivePlayers(s);
  if (alive.length <= 1) return endGame(s);
  if (s.options.target > 0) {
    const reached = alive.filter((p) => netWorth(s, p.id) >= s.options.target);
    if (reached.length > 0) {
      s.winner = [...reached].sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0]!.id;
      s.phase = 'over';
      s.auction = null;
    }
  }
}

/** The phase to return to when the mover has dealt with what they landed on. */
const afterLanding = (s: BankruptState) => (s.sixes > 0 ? 'roll' : 'after');

function moveBy(s: BankruptState, p: BankruptPlayer, steps: number) {
  const n = s.board.tiles.length;
  const from = p.pos;
  const to = (from + steps) % n;
  const passed = from + steps >= n;
  p.pos = to;
  s.events.push({ k: 'move', by: p.id, from, to, passedStart: passed });
  if (passed) {
    p.cash += s.board.salary;
    s.events.push({ k: 'salary', by: p.id, amount: s.board.salary });
  }
}

/** The mover stands on a space: pay rent, draw a card, offer a free space ... */
function land(s: BankruptState, p: BankruptPlayer, rng: Rng, depth = 0) {
  const tile = s.board.tiles[p.pos]!;
  s.phase = afterLanding(s);
  if (isOwnable(tile)) {
    const holding = s.owned[tile.id];
    if (!holding) s.phase = 'buy';
    else if (holding.owner !== p.id) {
      const amount = rentOf(s, tile);
      const owner = playerOf(s, holding.owner)!;
      pay(s, p, owner, amount);
      s.events.push({ k: 'rent', by: p.id, to: owner.id, tile: tile.id, amount });
    }
  } else if (tile.kind === 'jail') {
    // The Jail space itself puts you in jail: pay now or sit three turns out.
    sendToJail(s, p);
    s.phase = jailChoice(s, p); // (nothing to ask when the fee cannot be paid)
  } else if (tile.kind === 'auction') startTrade(s, p);
  else if (tile.kind === 'card' && s.board.cards.length > 0 && depth < 3) {
    // (the fortunate-wheel card is only in the pack with the Special wheel option)
    // A real deck: dealt from the top, shuffled again when every card has been used.
    const pack = cardPack(s.board, s.options);
    if (s.deck.length === 0 || s.deck.some((i) => i >= pack.length))
      s.deck = shuffled(pack.length, rng);
    const card = pack[s.deck.shift()!]!;
    const kind: CardKind =
      card.effect.type === 'cash'
        ? card.effect.amount >= 0
          ? 'gain'
          : 'pay'
        : card.effect.type === 'collectEach'
          ? 'birthday'
          : card.effect.type === 'payEach'
            ? 'party'
            : card.effect.type === 'moveTo'
              ? 'travel'
              : card.effect.type === 'perBuilding'
                ? 'repair'
                : card.effect.type === 'wheel'
                  ? 'wheel'
                  : 'jail';
    s.events.push({ k: 'card', by: p.id, text: card.text, kind });
    const e = card.effect;
    const others = () => alivePlayers(s).filter((x) => x.id !== p.id);
    const give = (from: BankruptPlayer | null, to: BankruptPlayer | null, amount: number) => {
      if (amount <= 0) return;
      s.events.push({ k: 'pay', from: from?.id ?? null, to: to?.id ?? null, amount });
      pay(s, from, to, amount);
    };
    if (e.type === 'cash') {
      if (e.amount >= 0) give(null, p, e.amount);
      else give(p, null, -e.amount);
    } else if (e.type === 'collectEach') {
      for (const o of others()) give(o, p, e.amount);
    } else if (e.type === 'payEach') {
      for (const o of others()) give(p, o, e.amount);
    } else if (e.type === 'perBuilding') {
      const total = buildingsOf(s, p.id) * e.amount;
      if (total >= 0) give(null, p, total);
      // (the repair bill can never bankrupt you: it only takes what the debt limit still allows)
      else give(p, null, Math.min(-total, Math.max(0, p.cash - s.board.bankruptBelow)));
    } else if (e.type === 'wheel') {
      p.wheel = true; // the next roll is the special wheel
    } else if (e.type === 'jail') {
      sendToJail(s, p);
      s.phase = jailChoice(s, p);
    } else if (e.type === 'moveTo') {
      const target = tileIndex(s.board, e.tile);
      if (target >= 0 && target !== p.pos) {
        moveBy(s, p, stepsBetween(s.board, p.pos, target));
        if (!p.bankrupt) land(s, p, rng, depth + 1);
      }
    }
  }
  if (p.bankrupt) s.phase = 'after';
}

/** The auction is settled when only the highest bidder is left (or nobody bid and everybody stepped out). */
/** Rainbow Road: every owned space of the street goes back to the bank, each owner is paid its sell price. */
function sellStreet(s: BankruptState, by: PlayerId, street: PropertyTile[]) {
  const payouts = street
    .filter((t) => s.owned[t.id])
    .map((t) => {
      const owner = s.owned[t.id]!.owner;
      const amount = t.sell + s.owned[t.id]!.level * buildingRefund(t);
      playerOf(s, owner)!.cash += amount;
      delete s.owned[t.id];
      return { player: owner, tile: t.id, amount };
    });
  s.events.push({ k: 'rainbow', by, tiles: street.map((t) => t.id), payouts });
}

/**
 * Rainbow Road, whatever way a space changed hands (bought, won at auction, traded): when the street of exactly
 * three now has three different owners, it is sold back to the bank and every owner is paid.
 */
function rainbowCheck(s: BankruptState, tileId: string, by: PlayerId) {
  if (!s.options.rainbowRoad) return;
  const t = tileById(s.board, tileId);
  if (t?.kind !== 'property') return;
  const street = groupOf(s.board, t);
  const owners = street.map((x) => s.owned[x.id]?.owner);
  if (street.length === 3 && owners.every(Boolean) && new Set(owners).size === 3)
    sellStreet(s, by, street);
}

/** `from`: who just acted (or the mover who put the space up); the turn goes on to the next bidder after them. */
function resolveAuction(s: BankruptState, from: PlayerId) {
  const a = s.auction;
  if (!a) return;
  // Somebody who has no more money than the highest bid cannot raise it: they step out by themselves.
  const floor = Math.max(a.min - 1, a.high?.amount ?? 0);
  for (const p of bidders(s)) if (p.id !== a.high?.player && p.cash <= floor) a.passed.push(p.id);
  const open = bidders(s).filter((p) => p.id !== a.high?.player);
  if (open.length > 0) {
    // The next one in seat order after `from` who may still bid; the one who put the space up is asked last, so
    // when nobody else wants it they can still take it (at the opening bid) instead of being left out.
    const others = open.filter((o) => o.id !== a.starter);
    const pool = others.length > 0 ? others : open;
    const n = s.players.length;
    const start = s.players.findIndex((p) => p.id === from);
    for (let i = 1; i <= n; i++) {
      const p = s.players[(start + i) % n]!;
      if (pool.some((o) => o.id === p.id)) {
        a.turn = p.id;
        return;
      }
    }
    return;
  }
  if (a.high) {
    const winner = playerOf(s, a.high.player)!;
    pay(s, winner, null, a.high.amount);
    s.owned[a.tile] = { owner: winner.id, level: 0 };
    s.events.push({ k: 'auction', tile: a.tile, winner: winner.id, amount: a.high.amount });
    // Not taken as a Rainbow Road by the mover, but the winner completes the street: it counts as one.
    rainbowCheck(s, a.tile, winner.id);
  } else s.events.push({ k: 'auction', tile: a.tile, winner: null, amount: 0 });
  s.auction = null;
  s.phase = afterLanding(s);
}

// ---- the trade on the Auction corner --------------------------------------------------------------

/** Spaces a player may trade: not built on. */
const tradable = (s: BankruptState, id: PlayerId) =>
  holdingsOf(s, id).filter((t) => (s.owned[t.id]?.level ?? 0) === 0);

/** The other players who have something to offer. */
const traders = (s: BankruptState, by: PlayerId) =>
  alivePlayers(s).filter((p) => p.id !== by && !p.bot && tradable(s, p.id).length > 0);

/** The mover landed on the Auction corner: a trade starts if somebody on each side has a space to trade. */
function startTrade(s: BankruptState, p: BankruptPlayer) {
  // Nothing to swap, or nobody who would (computers never trade): no pick at all, the screen says so.
  if (p.bot || tradable(s, p.id).length === 0 || traders(s, p.id).length === 0) {
    s.events.push({ k: 'tradeNone', by: p.id });
    return;
  }
  s.trade = { by: p.id, stage: 'pick', give: null, offers: {} };
  s.phase = 'trade';
}

function endTrade(s: BankruptState, ended = true) {
  const t = s.trade;
  if (!t) return;
  if (ended) s.events.push({ k: 'tradeEnd', by: t.by });
  s.trade = null;
  if (s.phase === 'trade') s.phase = afterLanding(s);
}

/** Everybody has answered: the mover chooses among the offers, or the trade ends when nobody offered. */
function offersDone(s: BankruptState) {
  const t = s.trade!;
  const waiting = traders(s, t.by).filter((p) => !(p.id in t.offers));
  if (waiting.length > 0) return;
  if (Object.values(t.offers).some((o) => o !== null)) t.stage = 'choose';
  else endTrade(s);
}

// ---- validation ---------------------------------------------------------------------------------

function validateMove(
  state: BankruptState,
  playerId: PlayerId,
  move: BankruptMove,
): MoveValidation {
  const me = playerOf(state, playerId);
  if (!me || me.bankrupt) return err('Not your turn');
  if (state.phase === 'over') return err('The game is over');
  const isMover = mover(state).id === playerId;

  // ---- answers that do not need the turn
  if (move.type === 'bid' || move.type === 'passBid') {
    const a = state.auction;
    if (!a) return err('There is no auction');
    if (a.passed.includes(playerId) || a.turn !== playerId) return err('Not your turn');
    if (move.type === 'passBid')
      return a.high?.player === playerId ? err('You already have the highest bid') : OK;
    if (a.high?.player === playerId) return err('You already have the highest bid');
    if (move.amount < a.min || move.amount <= (a.high?.amount ?? 0))
      return err(a.high ? 'Bid more than the highest bid' : 'The opening bid is too low');
    if (move.amount > me.cash) return err('Not enough money');
    return OK;
  }
  if (move.type === 'bailPay' || move.type === 'bailRefuse') {
    const b = state.bail;
    if (!b) return err('There is no one to bail out');
    if (!b.voters.includes(playerId)) return err('Not your turn');
    if (b.accepted.includes(playerId)) return err('You have already answered');
    return move.type === 'bailRefuse' || me.cash >= b.amount ? OK : err('Not enough money');
  }
  if (move.type === 'tradeOffer' || move.type === 'tradePass') {
    const t = state.trade;
    // (a player may pass already while the mover is still choosing: they do not want to trade)
    if (!t || (t.stage !== 'offers' && !(move.type === 'tradePass' && t.stage === 'pick')))
      return err('There is no trade to answer');
    if (playerId === t.by) return err('Not your turn');
    if (playerId in t.offers) return err('You have already answered');
    if (move.type === 'tradePass') return OK;
    const mine = state.owned[move.tile];
    if (mine?.owner !== playerId || mine.level > 0)
      return err('Pick one of your spaces without buildings');
    return OK;
  }
  if (move.type === 'tradePick' || move.type === 'tradeAccept' || move.type === 'tradeCancel') {
    const t = state.trade;
    if (!t) return err('There is no trade to answer');
    if (t.by !== playerId) return err('Not your turn');
    if (move.type === 'tradeCancel') return OK;
    if (move.type === 'tradePick') {
      if (t.stage !== 'pick') return err('You cannot do that right now');
      const mine = state.owned[move.tile];
      return mine?.owner === playerId && mine.level === 0
        ? OK
        : err('Pick one of your spaces without buildings');
    }
    if (t.stage !== 'choose') return err('You cannot do that right now');
    return t.offers[move.from] ? OK : err('That player made no offer');
  }
  // ---- everything else is the mover's
  if (!isMover) return err('Not your turn');
  if (state.auction) return err('Finish the auction first');
  if (state.trade) return err('Finish the trade first');
  if (state.bail) return err('Finish the vote first');
  const free = state.phase === 'roll' || state.phase === 'after';

  switch (move.type) {
    case 'roll':
      if (state.phase !== 'roll') return err('You cannot do that right now');
      return OK;
    case 'payJail':
      if (state.phase !== 'jailAsk') return err('You are not in jail');
      return me.cash >= state.board.jailFee ? OK : err('Not enough money');
    case 'wait':
      return state.phase === 'jailAsk' ? OK : err('You are not in jail');
    case 'buy': {
      if (state.phase !== 'buy') return err('You cannot do that right now');
      const t = ownable(state, state.board.tiles[me.pos]!.id)!;
      return me.cash >= t.price ? OK : err('Not enough money');
    }
    case 'decline':
      return state.phase === 'buy' ? OK : err('You cannot do that right now');
    case 'rainbow':
      return rainbowRoad(state, playerId) ? OK : err('There is no Rainbow Road here');
    case 'build': {
      if (!free) return err('You cannot do that right now');
      const t = tileById(state.board, move.tile);
      if (!t) return err('Unknown space');
      if (t.kind !== 'property' || state.owned[t.id]?.owner !== playerId)
        return err('You do not own that space');
      if (!ownsSet(state, playerId, t)) return err('You need the whole colour set to build');
      if ((state.owned[t.id]?.level ?? 0) >= 3) return err('That space is fully built');
      return me.cash >= t.buildCost ? OK : err('Not enough money');
    }
    case 'sellBuilding': {
      if (!free) return err('You cannot do that right now');
      const t = tileById(state.board, move.tile);
      if (!t) return err('Unknown space');
      if (state.owned[t.id]?.owner !== playerId) return err('You do not own that space');
      return (state.owned[t.id]?.level ?? 0) > 0 ? OK : err('There is nothing to sell there');
    }
    case 'sellProperty': {
      if (!free) return err('You cannot do that right now');
      const t = ownable(state, move.tile);
      if (!t) return err('Unknown space');
      return state.owned[t.id]?.owner === playerId ? OK : err('You do not own that space');
    }
  }
  return err('You cannot do that right now');
}

// ---- moves ---------------------------------------------------------------------------------------

function applyMove(
  state: BankruptState,
  playerId: PlayerId,
  move: BankruptMove,
  rng: Rng,
): BankruptState {
  const check = validateMove(state, playerId, move);
  if (!check.ok) throw new Error(check.error);
  const s = draft(state);
  const me = playerOf(s, playerId)!;
  const m = mover(s);

  switch (move.type) {
    case 'roll': {
      // The special wheel: after three sixes in a row, or when a fortunate-wheel card is waiting.
      const special = s.options.specialWheel && (me.wheel || s.sixes === SIXES_FOR_WHEEL);
      let die: number;
      let wheel: { idx: number; slice: string; from: number } | undefined;
      if (special) {
        me.wheel = false;
        const idx = rng.int(SPECIAL_SLICES.length);
        const slice = SPECIAL_SLICES[idx]!;
        wheel = { idx, slice, from: me.pos };
        die = /^\d$/.test(slice) ? Number(slice) : 0;
      } else {
        // One die. A six moves you and then lets you roll again, with no penalty however often it comes.
        die = rng.int(6) + 1;
      }
      s.dice = die;
      s.events.push({ k: 'roll', by: me.id, dice: die, ...(wheel ? { wheel } : {}) });
      if (wheel && die === 0) {
        // $50 from the bank, or off to jail: no walking.
        s.sixes = 0;
        if (wheel.slice === 'JAIL') {
          sendToJail(s, me);
          s.phase = jailChoice(s, me);
        } else {
          pay(s, null, me, WHEEL_CASH);
          s.phase = 'after';
        }
        break;
      }
      s.sixes = die === 6 ? s.sixes + 1 : 0;
      moveBy(s, me, die);
      land(s, me, rng);
      break;
    }
    case 'bailPay': {
      const b = s.bail!;
      b.accepted.push(me.id);
      // Everybody said yes: each pays the bail to the bank and the frog is free, with a turn to play now.
      if (b.voters.every((v) => b.accepted.includes(v))) {
        for (const v of b.voters) pay(s, playerOf(s, v)!, null, b.amount);
        playerOf(s, b.subject)!.jail = 0;
        s.events.push({ k: 'bail', subject: b.subject, payers: b.voters, amount: b.amount });
        s.events.push({ k: 'free', by: b.subject });
        s.bail = null;
        s.phase = 'roll';
        s.sixes = 0;
      }
      break;
    }
    case 'bailRefuse': {
      // One no and the deal is off: the jailed turn is sat out as usual.
      const b = s.bail!;
      s.bail = null;
      s.events.push({ k: 'bailRefused', by: me.id, subject: b.subject });
      skipJailTurn(s, playerOf(s, b.subject)!);
      nextSeat(s);
      settleTurn(s);
      break;
    }
    case 'payJail':
      pay(s, me, null, s.board.jailFee);
      me.jail = 0;
      s.events.push({ k: 'free', by: me.id, fee: s.board.jailFee });
      advanceTurn(s);
      break;
    case 'wait':
      // They stay: their next turns are skipped by themselves, nothing is asked again.
      advanceTurn(s);
      break;
    case 'buy': {
      const t = ownable(s, s.board.tiles[me.pos]!.id)!;
      pay(s, me, null, t.price);
      s.owned[t.id] = { owner: me.id, level: 0 };
      s.events.push({ k: 'buy', by: me.id, tile: t.id, price: t.price });
      rainbowCheck(s, t.id, me.id);
      s.phase = afterLanding(s);
      break;
    }
    case 'decline':
      {
        const t = ownable(s, s.board.tiles[me.pos]!.id)!;
        const min = openingBid(t.price);
        // Somebody other than the one who passed must be able to afford the opening bid, else no auction.
        const rivals = alivePlayers(s).filter((p) => p.id !== me.id && p.cash >= min);
        // Only a player who chose not to buy puts it up for auction: one who cannot afford it just passes.
        if (s.options.auctionOnDecline && me.cash >= t.price && rivals.length > 0) {
          s.auction = { tile: t.id, min, high: null, passed: [], turn: me.id, starter: me.id, bids: {} };
          s.phase = 'auction';
          resolveAuction(s, me.id);
        } else s.phase = afterLanding(s); // not sold: it stays free
      }
      break;
    case 'build': {
      const t = tileById(s.board, move.tile) as PropertyTile;
      const h = s.owned[t.id]!;
      pay(s, me, null, t.buildCost);
      h.level += 1;
      s.events.push({ k: 'build', by: me.id, tile: t.id, level: h.level, amount: t.buildCost });
      break;
    }
    case 'sellBuilding': {
      const t = tileById(s.board, move.tile) as PropertyTile;
      const h = s.owned[t.id]!;
      h.level -= 1;
      me.cash += buildingRefund(t);
      s.events.push({
        k: 'build',
        by: me.id,
        tile: t.id,
        level: h.level,
        amount: -buildingRefund(t),
      });
      break;
    }
    case 'rainbow': {
      // The street is sold back to the bank: each owner is paid their space's sell price.
      sellStreet(s, me.id, rainbowRoad(state, me.id)!.tiles);
      s.phase = afterLanding(s);
      break;
    }
    case 'sellProperty': {
      const t = ownable(s, move.tile)!;
      const h = s.owned[t.id]!;
      const amount = t.sell + (t.kind === 'property' ? h.level * buildingRefund(t) : 0);
      me.cash += amount;
      delete s.owned[t.id];
      s.events.push({ k: 'sold', by: me.id, tile: t.id, amount });
      break;
    }
    case 'bid':
      s.auction!.high = { player: me.id, amount: move.amount };
      s.auction!.bids[me.id] = move.amount;
      resolveAuction(s, me.id);
      break;
    case 'passBid':
      s.auction!.passed.push(me.id);
      resolveAuction(s, me.id);
      break;
    case 'tradePick': {
      const t = s.trade!;
      t.give = move.tile;
      t.stage = 'offers';
      offersDone(s); // (nobody else can offer: the trade is over)
      break;
    }
    case 'tradeOffer':
      s.trade!.offers[me.id] = move.tile;
      offersDone(s);
      break;
    case 'tradePass': {
      const t = s.trade!;
      t.offers[me.id] = null;
      // Still choosing, and nobody else wants to trade either: nothing left to trade.
      if (t.stage === 'pick') {
        if (traders(s, t.by).every((p) => p.id in t.offers)) endTrade(s);
      } else offersDone(s);
      break;
    }
    case 'tradeAccept': {
      const t = s.trade!;
      const other = playerOf(s, move.from)!;
      const take = t.offers[move.from]!;
      const give = t.give!;
      s.owned[give] = { owner: other.id, level: 0 };
      s.owned[take] = { owner: me.id, level: 0 };
      me.cash += s.board.tradeBonus;
      other.cash += s.board.tradeBonus;
      s.events.push({
        k: 'trade',
        by: me.id,
        with: other.id,
        give,
        take,
        bonus: s.board.tradeBonus,
      });
      rainbowCheck(s, give, me.id);
      rainbowCheck(s, take, me.id);
      endTrade(s, false);
      break;
    }
    case 'tradeCancel':
      endTrade(s);
      break;
  }

  // Somebody may have gone out (rent, a card, a bill): their holdings are back with the bank.
  if (s.phase !== 'over') {
    for (const p of s.players) checkBankrupt(s, p);
    if (m.bankrupt && s.phase !== 'auction' && s.phase !== 'trade' && s.phase !== 'bail')
      advanceTurn(s);
    else if (s.auction === null && s.phase === 'auction') s.phase = afterLanding(s);
  }
  // Every turn ends by itself once its landing is dealt with (there is no End turn button).
  if (s.phase === 'after') advanceTurn(s);
  checkWin(s);
  return s;
}

// ---- views, results, computers ---------------------------------------------------------------------

function getPlayerView(state: BankruptState): BankruptView {
  // (everything is public, except the order of the luck cards that are still to come)
  return { ...state, deck: state.deck.map(() => -1) };
}

function getCurrentPlayers(state: BankruptState): PlayerId[] {
  if (state.phase === 'over') return [];
  if (state.phase === 'auction' && state.auction) return [state.auction.turn];
  if (state.bail) return state.bail.voters.filter((v) => !state.bail!.accepted.includes(v));
  const t = state.trade;
  if (t) {
    if (t.stage === 'offers')
      return traders(state, t.by)
        .filter((p) => !(p.id in t.offers))
        .map((p) => p.id);
    return [t.by];
  }
  return [mover(state).id];
}

function getResults(state: BankruptState): GameResults {
  const rows = state.players.map((p) => ({
    id: p.id,
    worth: netWorth(state, p.id),
    bankrupt: p.bankrupt,
    outAt: p.outAt,
  }));
  rows.sort((a, b) => {
    if (a.id === state.winner) return -1;
    if (b.id === state.winner) return 1;
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    if (a.bankrupt) return b.outAt - a.outAt;
    return b.worth - a.worth;
  });
  let rank = 0;
  let last: (typeof rows)[number] | undefined;
  return {
    rankings: rows.map((r, i) => {
      const tied =
        last && !r.bankrupt && !last.bankrupt && r.worth === last.worth && last.id !== state.winner;
      if (!tied) rank = i + 1;
      last = r;
      return { playerId: r.id, score: r.worth, rank };
    }),
  };
}

function autoMove(state: BankruptState, playerId: PlayerId, _rng: Rng): AutoMove<BankruptMove> {
  const me = playerOf(state, playerId)!;
  const done = (move: BankruptMove, endsTurn = false): AutoMove<BankruptMove> => ({
    move,
    endsTurn,
  });

  if (state.phase === 'auction' && state.auction) {
    const t = ownable(state, state.auction.tile)!;
    const set =
      t.kind === 'property' &&
      holdingsOf(state, playerId).some((o) => o.kind === 'property' && o.group === t.group);
    const ceiling = Math.min(me.cash - 50, Math.floor(t.price * (set ? 1.3 : 1.05)));
    const step = bidStep(t.price);
    const bid = state.auction.high ? state.auction.high.amount + step : state.auction.min;
    return bid <= ceiling && bid <= me.cash
      ? done({ type: 'bid', amount: bid }, true)
      : done({ type: 'passBid' }, true);
  }

  // Computers always pay a bail.
  if (state.bail) return done({ type: 'bailPay' }, true);

  if (state.trade) {
    const t = state.trade;
    // Computers do not trade: the mover cancels, the others pass.
    if (t.by === playerId) return done({ type: 'tradeCancel' }, true);
    return done({ type: 'tradePass' }, true);
  }

  if (state.phase === 'buy') {
    // (a Rainbow Road on offer: take it, the street is sold and nobody pays for the space)
    if (rainbowRoad(state, playerId)) return done({ type: 'rainbow' });
    const t = ownable(state, state.board.tiles[me.pos]!.id)!;
    return me.cash - t.price >= 150 ? done({ type: 'buy' }) : done({ type: 'decline' });
  }

  if (state.phase === 'jailAsk')
    return me.cash >= state.board.jailFee + 400
      ? done({ type: 'payJail' })
      : done({ type: 'wait' }, true);

  // Build on a full set while there is a cash cushion left.
  for (const t of holdingsOf(state, playerId)) {
    if (t.kind !== 'property') continue;
    const level = state.owned[t.id]?.level ?? 0;
    if (level < 3 && ownsSet(state, playerId, t) && me.cash - t.buildCost >= 300)
      return done({ type: 'build', tile: t.id });
  }
  // Short of money: sell a building, then a space, before the debt is too deep.
  if (me.cash < state.board.bankruptBelow / 2) {
    for (const t of holdingsOf(state, playerId))
      if ((state.owned[t.id]?.level ?? 0) > 0) return done({ type: 'sellBuilding', tile: t.id });
    const cheapest = [...holdingsOf(state, playerId)].sort((a, b) => a.sell - b.sell)[0];
    if (cheapest) return done({ type: 'sellProperty', tile: cheapest.id });
  }
  return done({ type: 'roll' });
}

export const bankruptGame: GameDefinition<
  BankruptState,
  BankruptMove,
  BankruptOptions,
  BankruptView
> = {
  id: 'bankrupt',
  name: 'Bankrupt',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  // Everybody picks their frog's colour in the lobby; the host is always red.
  choices: PLAYER_COLOURS,
  defaultOptions: {
    target: 5000,
    turns: 0,
    auctionOnDecline: true,
    rainbowRoad: false,
    freeFroggo: false,
    specialWheel: true,
  },
  moveSchema: bankruptMoveSchema,
  // Building and selling must not buy anybody more time.
  isFreeMove: (move) =>
    move.type === 'build' || move.type === 'sellBuilding' || move.type === 'sellProperty',
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
  supportsBots: true,
  // An auction runs on its own 15 second clock for whoever's turn it is to bid (it starts again with every
  // move); when it runs out, that player steps out.
  phaseClockMs: (state) =>
    state.bail
      ? BAIL_SEC * 1000
      : state.trade
        ? TRADE_SEC * 1000
        : state.phase === 'auction' && state.auction
          ? AUCTION_SEC * 1000
          : null,
  // The trade's offers share one clock: it keeps running while the others answer.
  keepsClock: (before, after) =>
    !!before.trade && before.trade.stage === 'offers' && after.trade?.stage === 'offers',
  timeoutMove: (state, playerId, rng) =>
    state.bail
      ? { move: { type: 'bailRefuse' }, endsTurn: true }
      : state.trade
        ? state.trade.by === playerId
          ? { move: { type: 'tradeCancel' }, endsTurn: true }
          : { move: { type: 'tradePass' }, endsTurn: true }
        : state.phase === 'auction' && state.auction
          ? { move: { type: 'passBid' }, endsTurn: true }
          : autoMove(state, playerId, rng),
  // The die and the token's walk take a while on screen; computers wait for it.
  settleMs: (state) => {
    let ms = 0;
    for (const e of state.events) {
      if (e.k === 'roll') ms += ROLL_MS;
      if (e.k === 'move') ms += stepsBetween(state.board, e.from, e.to) * STEP_MS;
      if (e.k === 'card') ms += CARD_SHOW_MS + 2 * CARD_SLIDE_MS;
      if (e.k === 'bail') ms += 2000;
    }
    return ms;
  },
  matchSummary: (state) => ({
    target: state.options.target,
    turns: state.options.turns,
    rounds: state.round,
    worth: Object.fromEntries(state.players.map((p) => [p.id, netWorth(state, p.id)])),
  }),
};
