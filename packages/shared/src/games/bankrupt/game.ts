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
  BankruptState,
  BankruptView,
} from './types';

/** Milliseconds the screen needs to show the dice and one step of a token. */
export const ROLL_MS = 900;
export const STEP_MS = 180;
/** The smallest bid, and the step bots bid in. */
export const MIN_BID = 10;

const optionsSchema: z.ZodType<BankruptOptions, z.ZodTypeDef, unknown> = z
  .object({
    target: z
      .number()
      .int()
      .refine((n) => (TARGETS as readonly number[]).includes(n)),
    turns: z
      .number()
      .int()
      .refine((n) => (TURN_LIMITS as readonly number[]).includes(n)),
  })
  .strict();

const tileKey = z.string().min(1).max(30);
export const bankruptMoveSchema: z.ZodType<BankruptMove, z.ZodTypeDef, unknown> =
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('roll') }),
    z.object({ type: z.literal('buy') }),
    z.object({ type: z.literal('decline') }),
    z.object({ type: z.literal('endTurn') }),
    z.object({ type: z.literal('payJail') }),
    z.object({ type: z.literal('wait') }),
    z.object({ type: z.literal('build'), tile: tileKey }),
    z.object({ type: z.literal('sellBuilding'), tile: tileKey }),
    z.object({ type: z.literal('sellProperty'), tile: tileKey }),
    z.object({ type: z.literal('startAuction'), tile: tileKey }),
    z.object({ type: z.literal('bid'), amount: z.number().int().min(1).max(1_000_000) }),
    z.object({ type: z.literal('passBid') }),
    z.object({ type: z.literal('cancelAuction') }),
    z.object({
      type: z.literal('proposeTrade'),
      to: z.string().min(1).max(64),
      give: z.array(tileKey).max(30),
      take: z.array(tileKey).max(30),
      cash: z.number().int().min(-100_000).max(100_000),
    }),
    z.object({ type: z.literal('acceptTrade') }),
    z.object({ type: z.literal('declineTrade') }),
    z.object({ type: z.literal('cancelTrade') }),
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
    doubles: 0,
    dice: null,
    auctionRight: false,
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
    trade: s.trade ? { ...s.trade, give: [...s.trade.give], take: [...s.trade.take] } : null,
    events: [],
    seq: s.seq + 1,
  };
}

const ownable = (s: BankruptState, id: string): OwnableTile | undefined => {
  const t = tileById(s.board, id);
  return t && isOwnable(t) ? t : undefined;
};

/** Players who may still bid: alive, not the seller, not stepped out. */
const bidders = (s: BankruptState) =>
  s.auction
    ? alivePlayers(s).filter((p) => p.id !== s.auction!.seller && !s.auction!.passed.includes(p.id))
    : [];

function declareBankrupt(s: BankruptState, p: BankruptPlayer) {
  if (p.bankrupt) return;
  p.bankrupt = true;
  p.outAt = s.players.filter((x) => x.bankrupt).length;
  for (const [tile, h] of Object.entries(s.owned)) if (h.owner === p.id) delete s.owned[tile];
  s.events.push({ k: 'bankrupt', by: p.id });
  if (s.trade && (s.trade.from === p.id || s.trade.to === p.id)) s.trade = null;
  if (s.auction?.seller === p.id) s.auction = null;
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
  s.doubles = 0;
  s.events.push({ k: 'jail', by: p.id });
}

/** After a turn-ending situation: who is next (a new round when the order wraps), or the game is over. */
function advanceTurn(s: BankruptState) {
  const n = s.players.length;
  const from = s.turn;
  let i = from;
  do i = (i + 1) % n;
  while (s.players[i]!.bankrupt && i !== from);
  // Passing the last seat back to the first starts a new round.
  const wrapped = i <= from;
  s.turn = i;
  if (wrapped) s.round += 1;
  s.phase = 'roll';
  s.doubles = 0;
  s.dice = null;
  s.auctionRight = false;
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
  s.trade = null;
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
      s.trade = null;
    }
  }
}

/** The phase to return to when the mover has dealt with what they landed on. */
const afterLanding = (s: BankruptState) => (s.doubles > 0 ? 'roll' : 'after');

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
      const amount = rentOf(s, tile, s.dice);
      const owner = playerOf(s, holding.owner)!;
      pay(s, p, owner, amount);
      s.events.push({ k: 'rent', by: p.id, to: owner.id, tile: tile.id, amount });
    }
  } else if (tile.kind === 'auction') s.auctionRight = true;
  else if (tile.kind === 'card' && s.board.cards.length > 0 && depth < 3) {
    const card = s.board.cards[rng.int(s.board.cards.length)]!;
    s.events.push({ k: 'card', by: p.id, text: card.text });
    const e = card.effect;
    const others = () => alivePlayers(s).filter((x) => x.id !== p.id);
    if (e.type === 'cash') {
      if (e.amount >= 0) p.cash += e.amount;
      else pay(s, p, null, -e.amount);
    } else if (e.type === 'collectEach') {
      for (const o of others()) pay(s, o, p, e.amount);
    } else if (e.type === 'payEach') {
      for (const o of others()) pay(s, p, o, e.amount);
    } else if (e.type === 'perBuilding') {
      const total = buildingsOf(s, p.id) * e.amount;
      if (total >= 0) p.cash += total;
      else pay(s, p, null, -total);
    } else if (e.type === 'jail') {
      sendToJail(s, p);
      s.phase = 'after';
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
  const open = bidders(s).filter((p) => p.id !== a.high?.player);
  if (open.length > 0) return;
  if (a.high) {
    const winner = playerOf(s, a.high.player)!;
    const seller = a.seller ? (playerOf(s, a.seller) ?? null) : null;
    pay(s, winner, seller, a.high.amount);
    s.owned[a.tile] = { owner: winner.id, level: 0 };
    s.events.push({ k: 'auction', tile: a.tile, winner: winner.id, amount: a.high.amount });
  } else s.events.push({ k: 'auction', tile: a.tile, winner: null, amount: 0 });
  s.auction = null;
  s.phase = afterLanding(s);
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
    if (a.seller === playerId) return err('The seller cannot bid');
    if (a.passed.includes(playerId)) return err('Not your turn');
    if (move.type === 'passBid')
      return a.high?.player === playerId ? err('You already have the highest bid') : OK;
    if (a.high?.player === playerId) return err('You already have the highest bid');
    if (move.amount < MIN_BID || move.amount <= (a.high?.amount ?? 0))
      return err('Bid more than the highest bid');
    if (move.amount > me.cash) return err('Not enough money');
    return OK;
  }
  if (move.type === 'cancelAuction') {
    if (!state.auction) return err('There is no auction');
    return state.auction.seller === playerId ? OK : err('Only the seller can cancel the auction');
  }
  if (move.type === 'acceptTrade' || move.type === 'declineTrade') {
    const t = state.trade;
    if (!t) return err('There is no trade offer');
    if (t.to !== playerId) return err('Only the player the offer is for can answer it');
    if (move.type === 'declineTrade') return OK;
    const from = playerOf(state, t.from)!;
    if (t.cash > 0 && from.cash < t.cash) return err('Not enough money');
    if (t.cash < 0 && me.cash < -t.cash) return err('Not enough money');
    return OK;
  }
  if (move.type === 'cancelTrade') {
    if (!state.trade) return err('There is no trade offer');
    return state.trade.from === playerId
      ? OK
      : err('Only the player the offer is for can answer it');
  }

  // ---- everything else is the mover's
  if (!isMover) return err('Not your turn');
  if (state.trade) return err('Answer the trade offer first');
  if (state.auction) return err('Finish the auction first');
  const free = state.phase === 'roll' || state.phase === 'after';

  switch (move.type) {
    case 'roll':
      if (state.phase !== 'roll') return err('You cannot do that right now');
      if (me.jail > 0) return err('You are in jail: pay or wait');
      return OK;
    case 'payJail':
      if (me.jail === 0) return err('You are not in jail');
      if (state.phase !== 'roll') return err('You cannot do that right now');
      return me.cash >= state.board.jailFee ? OK : err('Not enough money');
    case 'wait':
      if (me.jail === 0) return err('You are not in jail');
      return state.phase === 'roll' ? OK : err('You cannot do that right now');
    case 'buy': {
      if (state.phase !== 'buy') return err('You cannot do that right now');
      const t = ownable(state, state.board.tiles[me.pos]!.id)!;
      return me.cash >= t.price ? OK : err('Not enough money');
    }
    case 'decline':
      return state.phase === 'buy' ? OK : err('You cannot do that right now');
    case 'endTurn':
      if (state.phase === 'roll') return err('Roll the dice first');
      return state.phase === 'after' ? OK : err('You cannot do that right now');
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
    case 'startAuction': {
      if (!free) return err('You cannot do that right now');
      if (!state.auctionRight) return err('You can only auction on the Auction corner');
      const t = ownable(state, move.tile);
      if (!t) return err('Unknown space');
      const h = state.owned[t.id];
      if (h?.owner !== playerId) return err('You do not own that space');
      return h.level > 0 ? err('Sell the buildings first') : OK;
    }
    case 'proposeTrade': {
      if (!free) return err('You cannot do that right now');
      const other = playerOf(state, move.to);
      if (!other || other.bankrupt || other.id === playerId)
        return err('Pick a player to trade with');
      if (move.give.length + move.take.length === 0 && move.cash === 0)
        return err('Offer something to trade');
      const mine = (id: string) =>
        state.owned[id]?.owner === playerId && (state.owned[id]?.level ?? 0) === 0;
      const theirs = (id: string) =>
        state.owned[id]?.owner === other.id && (state.owned[id]?.level ?? 0) === 0;
      if (!move.give.every(mine) || !move.take.every(theirs))
        return err('You can only trade spaces without buildings');
      if (move.cash > 0 && me.cash < move.cash) return err('Not enough money');
      if (move.cash < 0 && other.cash < -move.cash) return err('Not enough money');
      return OK;
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
      const dice: [number, number] = [rng.int(6) + 1, rng.int(6) + 1];
      s.dice = dice;
      s.events.push({ k: 'roll', by: me.id, dice });
      s.doubles = dice[0] === dice[1] ? s.doubles + 1 : 0;
      if (s.doubles >= 3) {
        sendToJail(s, me);
        s.phase = 'after';
      } else {
        moveBy(s, me, dice[0] + dice[1]);
        land(s, me, rng);
      }
      break;
    }
    case 'payJail':
      pay(s, me, null, s.board.jailFee);
      me.jail = 0;
      s.events.push({ k: 'free', by: me.id });
      break;
    case 'wait':
      me.jail -= 1;
      if (me.jail === 0) s.events.push({ k: 'free', by: me.id });
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
      s.auction = { tile: s.board.tiles[me.pos]!.id, seller: null, high: null, passed: [] };
      s.phase = 'auction';
      resolveAuction(s);
      break;
    case 'endTurn':
      advanceTurn(s);
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
    case 'startAuction':
      s.auction = { tile: move.tile, seller: me.id, high: null, passed: [] };
      s.auctionRight = false;
      s.phase = 'auction';
      resolveAuction(s);
      break;
    case 'bid':
      s.auction!.high = { player: me.id, amount: move.amount };
      resolveAuction(s);
      break;
    case 'passBid':
      s.auction!.passed.push(me.id);
      resolveAuction(s);
      break;
    case 'cancelAuction':
      s.events.push({ k: 'auction', tile: s.auction!.tile, winner: null, amount: 0 });
      s.auction = null;
      s.phase = afterLanding(s);
      break;
    case 'proposeTrade':
      s.trade = { from: me.id, to: move.to, give: move.give, take: move.take, cash: move.cash };
      break;
    case 'cancelTrade':
    case 'declineTrade':
      s.trade = null;
      break;
    case 'acceptTrade': {
      const t = s.trade!;
      const from = playerOf(s, t.from)!;
      for (const id of t.give) s.owned[id] = { owner: t.to, level: 0 };
      for (const id of t.take) s.owned[id] = { owner: t.from, level: 0 };
      from.cash -= t.cash;
      me.cash += t.cash;
      from.cash += s.board.tradeBonus;
      me.cash += s.board.tradeBonus;
      s.events.push({ k: 'trade', from: t.from, to: t.to });
      s.trade = null;
      break;
    }
  }

  // Somebody may have gone out (rent, a card, a bill): their holdings are back with the bank.
  if (s.phase !== 'over') {
    for (const p of s.players) checkBankrupt(s, p);
    if (m.bankrupt && s.phase !== 'auction') advanceTurn(s);
    else if (s.auction === null && s.phase === 'auction') s.phase = afterLanding(s);
  }
  checkWin(s);
  return s;
}

// ---- views, results, computers ---------------------------------------------------------------------

function getPlayerView(state: BankruptState): BankruptView {
  return state;
}

function getCurrentPlayers(state: BankruptState): PlayerId[] {
  if (state.phase === 'over') return [];
  if (state.trade) return [state.trade.to];
  if (state.phase === 'auction' && state.auction)
    return bidders(state)
      .filter((p) => p.id !== state.auction!.high?.player)
      .map((p) => p.id);
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

  if (state.trade && state.trade.to === playerId) return done({ type: 'declineTrade' }, true);

  if (state.phase === 'auction' && state.auction) {
    const t = ownable(state, state.auction.tile)!;
    const set =
      t.kind === 'property' &&
      holdingsOf(state, playerId).some((o) => o.kind === 'property' && o.group === t.group);
    const ceiling = Math.min(me.cash - 50, Math.floor(t.price * (set ? 1.3 : 1.05)));
    const step = Math.max(MIN_BID, round5(t.price * 0.1));
    const bid = state.auction.high
      ? state.auction.high.amount + step
      : Math.max(MIN_BID, round5(t.price * 0.4));
    return bid <= ceiling && bid <= me.cash
      ? done({ type: 'bid', amount: bid }, true)
      : done({ type: 'passBid' }, true);
  }

  if (state.phase === 'buy') {
    const t = ownable(state, state.board.tiles[me.pos]!.id)!;
    return me.cash - t.price >= 150 ? done({ type: 'buy' }) : done({ type: 'decline' });
  }

  if (me.jail > 0 && state.phase === 'roll')
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
  if (state.phase === 'roll') return done({ type: 'roll' });
  return done({ type: 'endTurn' }, true);
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
  defaultOptions: { target: 5000, turns: 0 },
  moveSchema: bankruptMoveSchema,
  // Building, selling and trade talk must not buy anybody more time.
  isFreeMove: (move) =>
    move.type === 'build' ||
    move.type === 'sellBuilding' ||
    move.type === 'sellProperty' ||
    move.type === 'proposeTrade' ||
    move.type === 'cancelTrade',
  createInitialState,
  validateMove,
  applyMove,
  getPlayerView,
  getCurrentPlayers,
  isGameOver: (state) => state.phase === 'over',
  getResults,
  autoMove,
  supportsBots: true,
  // The dice and the token's walk take a while on screen; computers wait for it.
  settleMs: (state) => {
    let ms = 0;
    for (const e of state.events) {
      if (e.k === 'roll') ms += ROLL_MS;
      if (e.k === 'move') ms += stepsBetween(state.board, e.from, e.to) * STEP_MS;
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
