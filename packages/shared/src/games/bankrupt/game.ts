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
import type { OwnableTile, PropertyTile } from './config';
import {
  alivePlayers,
  buildingRefund,
  buildingsOf,
  holdingsOf,
  mover,
  netWorth,
  ownsSet,
  playerOf,
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
export const ROLL_MS = 900;
export const STEP_MS = 280;
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
/** Seconds a trade on the Auction corner may take (the offers, and the choice). */
export const TRADE_SEC = 90;
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
  ]);

const OK: MoveValidation = { ok: true };
const err = (error: string): MoveValidation => ({ ok: false, error });

function createInitialState(
  players: GamePlayer[],
  options: BankruptOptions,
  rng: Rng,
): BankruptState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
    throw new Error(`Bankrupt! needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
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
      cash: board.startCash + i * board.startCashStep,
      pos: 0,
      jail: 0,
      bankrupt: false,
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
    events: [],
    seq: 0,
    winner: null,
  };
}

// ---- helpers on a mutable draft -----------------------------------------------------------------

function draft(s: BankruptState): BankruptState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
    owned: Object.fromEntries(Object.entries(s.owned).map(([k, v]) => [k, { ...v }])),
    auction: s.auction ? { ...s.auction, passed: [...s.auction.passed] } : null,
    trade: s.trade ? { ...s.trade, offers: { ...s.trade.offers } } : null,
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

function sendToJail(s: BankruptState, p: BankruptPlayer) {
  p.pos = tileIndex(s.board, s.board.tiles.find((t) => t.kind === 'jail')!.id);
  p.jail = s.board.jailTurns;
  s.sixes = 0;
  s.events.push({ k: 'jail', by: p.id });
}

/** After a turn-ending situation: who is next (a new round when the order wraps), or the game is over. */
function advanceTurn(s: BankruptState) {
  const n = s.players.length;
  const step = () => {
    const from = s.turn;
    let i = from;
    do i = (i + 1) % n;
    while (s.players[i]!.bankrupt && i !== from);
    // Passing the last seat back to the first starts a new round.
    if (i <= from) s.round += 1;
    s.turn = i;
  };
  step();
  // Somebody in jail sits their turn out (nothing is asked again): the next one plays.
  for (let guard = 0; guard < n * 4; guard++) {
    const p = s.players[s.turn]!;
    if (p.jail === 0) break;
    p.jail -= 1;
    s.events.push({ k: 'jailSkip', by: p.id, left: p.jail });
    if (p.jail === 0) s.events.push({ k: 'free', by: p.id });
    step();
  }
  s.phase = 'roll';
  s.sixes = 0;
  if (s.options.turns > 0 && s.round > s.options.turns) {
    s.round = s.options.turns;
    endGame(s);
  }
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
    s.phase = 'jailAsk';
  } else if (tile.kind === 'auction') startTrade(s, p);
  else if (tile.kind === 'card' && s.board.cards.length > 0 && depth < 3) {
    const card = s.board.cards[rng.int(s.board.cards.length)]!;
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
      else give(p, null, -total);
    } else if (e.type === 'jail') {
      sendToJail(s, p);
      s.phase = 'jailAsk';
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
function resolveAuction(s: BankruptState) {
  const a = s.auction;
  if (!a) return;
  // Somebody who has no more money than the highest bid cannot raise it: they step out by themselves.
  const floor = Math.max(a.min - 1, a.high?.amount ?? 0);
  for (const p of bidders(s)) if (p.id !== a.high?.player && p.cash <= floor) a.passed.push(p.id);
  const open = bidders(s).filter((p) => p.id !== a.high?.player);
  if (open.length > 0) return;
  if (a.high) {
    const winner = playerOf(s, a.high.player)!;
    pay(s, winner, null, a.high.amount);
    s.owned[a.tile] = { owner: winner.id, level: 0 };
    s.events.push({ k: 'auction', tile: a.tile, winner: winner.id, amount: a.high.amount });
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
  alivePlayers(s).filter((p) => p.id !== by && tradable(s, p.id).length > 0);

/** The mover landed on the Auction corner: a trade starts if somebody on each side has a space to trade. */
function startTrade(s: BankruptState, p: BankruptPlayer) {
  if (tradable(s, p.id).length === 0 || traders(s, p.id).length === 0) return;
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
    if (a.passed.includes(playerId)) return err('Not your turn');
    if (move.type === 'passBid')
      return a.high?.player === playerId ? err('You already have the highest bid') : OK;
    if (a.high?.player === playerId) return err('You already have the highest bid');
    if (move.amount < a.min || move.amount <= (a.high?.amount ?? 0))
      return err(a.high ? 'Bid more than the highest bid' : 'The opening bid is too low');
    if (move.amount > me.cash) return err('Not enough money');
    return OK;
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
      // One die. A six moves you and then lets you roll again, with no penalty however often it comes.
      const die = rng.int(6) + 1;
      s.dice = die;
      s.events.push({ k: 'roll', by: me.id, dice: die });
      s.sixes = die === 6 ? s.sixes + 1 : 0;
      moveBy(s, me, die);
      land(s, me, rng);
      break;
    }
    case 'payJail':
      pay(s, me, null, s.board.jailFee);
      me.jail = 0;
      s.events.push({ k: 'free', by: me.id });
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
          s.auction = { tile: t.id, min, high: null, passed: [] };
          s.phase = 'auction';
          resolveAuction(s);
        } else s.phase = afterLanding(s); // not sold: it stays free
      }
      break;
    case 'build': {
      const t = tileById(s.board, move.tile) as PropertyTile;
      const h = s.owned[t.id]!;
      pay(s, me, null, t.buildCost);
      h.level += 1;
      s.events.push({ k: 'build', by: me.id, tile: t.id, level: h.level });
      break;
    }
    case 'sellBuilding': {
      const t = tileById(s.board, move.tile) as PropertyTile;
      const h = s.owned[t.id]!;
      h.level -= 1;
      me.cash += buildingRefund(t);
      s.events.push({ k: 'build', by: me.id, tile: t.id, level: h.level });
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
      resolveAuction(s);
      break;
    case 'passBid':
      s.auction!.passed.push(me.id);
      resolveAuction(s);
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
    if (m.bankrupt && s.phase !== 'auction' && s.phase !== 'trade') advanceTurn(s);
    else if (s.auction === null && s.phase === 'auction') s.phase = afterLanding(s);
  }
  // Every turn ends by itself once its landing is dealt with (there is no End turn button).
  if (s.phase === 'after') advanceTurn(s);
  checkWin(s);
  return s;
}

// ---- views, results, computers ---------------------------------------------------------------------

function getPlayerView(state: BankruptState): BankruptView {
  return state;
}

function getCurrentPlayers(state: BankruptState): PlayerId[] {
  if (state.phase === 'over') return [];
  if (state.phase === 'auction' && state.auction)
    return bidders(state)
      .filter((p) => p.id !== state.auction!.high?.player)
      .map((p) => p.id);
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

const round5 = (n: number) => Math.round(n / 5) * 5;

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
    const step = Math.max(MIN_BID, round5(t.price * 0.1));
    const bid = state.auction.high ? state.auction.high.amount + step : state.auction.min;
    return bid <= ceiling && bid <= me.cash
      ? done({ type: 'bid', amount: bid }, true)
      : done({ type: 'passBid' }, true);
  }

  if (state.trade) {
    const t = state.trade;
    // Computers do not trade: the mover cancels, the others pass.
    if (t.by === playerId) return done({ type: 'tradeCancel' }, true);
    return done({ type: 'tradePass' }, true);
  }

  if (state.phase === 'buy') {
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
  name: 'Bankrupt!',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  optionsSchema,
  defaultOptions: { target: 5000, turns: 0, auctionOnDecline: true },
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
  // An auction runs on its own 15 second clock (it starts again with every bid); when it runs out,
  // everybody who has not bid steps out.
  phaseClockMs: (state) =>
    state.trade
      ? TRADE_SEC * 1000
      : state.phase === 'auction' && state.auction
        ? AUCTION_SEC * 1000
        : null,
  // The trade's offers share one clock: it keeps running while the others answer.
  keepsClock: (before, after) =>
    !!before.trade && before.trade.stage === 'offers' && after.trade?.stage === 'offers',
  timeoutMove: (state, playerId, rng) =>
    state.trade
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
