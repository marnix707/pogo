import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import { createDiceRng } from '../../game/testing';
import { boardConfigSchema, DEFAULT_BOARD } from './config';
import { bankruptGame as game, bidStep } from './game';
import { mover, netWorth, rentOf, tileById, tileIndex } from './rules';
import type { BankruptMove, BankruptOptions, BankruptState } from './types';
import * as bankrupt from './index';

const people = [
  { id: 'a', nickname: 'A', avatar: 'fox' },
  { id: 'b', nickname: 'B', avatar: 'cat' },
  { id: 'c', nickname: 'C', avatar: 'owl' },
];
const OPTIONS: BankruptOptions = {
  target: 0,
  turns: 0,
  auctionOnDecline: true,
  rainbowRoad: false,
  freeFroggo: false,
  specialWheel: false,
};

const start = (n = 2, options = OPTIONS): BankruptState =>
  game.createInitialState(people.slice(0, n), options, createSeededRng(7));

/** Faces for the dice, two per roll. */
const dice = (...faces: number[]) => createDiceRng(faces);
const play = (s: BankruptState, id: string, move: BankruptMove, rng = dice()) =>
  game.applyMove(s, id, move, rng);
const patch = (s: BankruptState, id: string, p: Partial<BankruptState['players'][number]>) => ({
  ...s,
  players: s.players.map((x) => (x.id === id ? { ...x, ...p } : x)),
});
const own = (s: BankruptState, tile: string, owner: string, level = 0): BankruptState => ({
  ...s,
  owned: { ...s.owned, [tile]: { owner, level } },
});
const turn = (s: BankruptState) => game.getCurrentPlayers(s)[0]!;
const cash = (s: BankruptState, id: string) => s.players.find((p) => p.id === id)!.cash;
const idx = (id: string) => tileIndex(DEFAULT_BOARD, id);
const other = (s: BankruptState) => s.players.find((p) => p.id !== mover(s).id)!.id;

describe('Bankrupt board and set-up', () => {
  it('ships a valid 28-space board and rejects broken ones', () => {
    expect(DEFAULT_BOARD.tiles).toHaveLength(28);
    expect(DEFAULT_BOARD.tiles[0]?.kind).toBe('start');
    const dup = { ...DEFAULT_BOARD, tiles: [...DEFAULT_BOARD.tiles, DEFAULT_BOARD.tiles[1]!] };
    expect(boardConfigSchema.safeParse(dup).success).toBe(false);
    const odd = { ...DEFAULT_BOARD, tiles: DEFAULT_BOARD.tiles.slice(0, 27) };
    expect(boardConfigSchema.safeParse(odd).success).toBe(false);
    const noJail = {
      ...DEFAULT_BOARD,
      tiles: DEFAULT_BOARD.tiles.filter((t) => t.kind !== 'jail'),
    };
    expect(boardConfigSchema.safeParse(noJail).success).toBe(false);
  });

  it('prices follow the screenshots (sell = 80 %, rent anchors)', () => {
    const t = (id: string) =>
      tileById(DEFAULT_BOARD, id) as Extract<ReturnType<typeof tileById>, { kind: 'property' }>;
    expect(t('rio')).toMatchObject({
      price: 100,
      sell: 80,
      buildCost: 50,
      rent: [10, 30, 90, 160],
    });
    expect(t('moscow')).toMatchObject({
      price: 200,
      sell: 160,
      buildCost: 120,
      rent: [30, 80, 190, 570],
    });
    expect(t('beijing')).toMatchObject({
      price: 300,
      sell: 240,
      buildCost: 170,
      rent: [40, 150, 300, 750],
    });
    expect(t('tokyo')).toMatchObject({
      price: 420,
      sell: 335,
      buildCost: 200,
      rent: [70, 200, 500, 900],
    });
  });

  it('starts everybody with more cash the later they sit', () => {
    const s = start(3);
    expect(s.players.map((p) => p.cash)).toEqual([1000, 1050, 1100]);
    expect(game.getCurrentPlayers(s)).toEqual([s.players[0]!.id]);
    expect(() => game.createInitialState(people.slice(0, 1), OPTIONS, createSeededRng(1))).toThrow(
      /needs 2-6 players/,
    );
  });

  it('checks the lobby options', () => {
    expect(game.optionsSchema.safeParse({ target: 7000, turns: 30 }).success).toBe(true);
    expect(game.optionsSchema.parse({})).toEqual({
      target: 5000,
      turns: 0,
      auctionOnDecline: true,
      rainbowRoad: false,
      freeFroggo: false,
      specialWheel: true,
    });
    expect(game.optionsSchema.safeParse({ auctionOnDecline: 'no' }).success).toBe(false);
    expect(game.optionsSchema.safeParse({ target: 0, turns: 0 }).success).toBe(true);
    expect(game.optionsSchema.safeParse({ target: 1234, turns: 0 }).success).toBe(false);
    expect(game.optionsSchema.safeParse({ target: 0, turns: 7 }).success).toBe(false);
  });
});

describe('moving, buying and rent', () => {
  it('moves by the dice, buys the space and goes on to the next player', () => {
    let s = start();
    const a = mover(s).id;
    s = play(s, a, { type: 'roll' }, dice(3));
    expect(s.dice).toBe(3);
    expect(s.players.find((p) => p.id === a)!.pos).toBe(idx('bangkok'));
    expect(s.phase).toBe('buy');
    const b = other(s);
    s = play(s, a, { type: 'buy' });
    expect(s.owned['bangkok']).toEqual({ owner: a, level: 0 });
    expect(cash(s, a)).toBe(1000 - 130);
    // The turn ends by itself (there is no End turn button).
    expect(mover(s).id).toBe(b);
    expect(s.phase).toBe('roll');
  });

  it('pays the salary for passing or landing on Start', () => {
    let s = start();
    const a = mover(s).id;
    s = patch(s, a, { pos: 26 });
    s = play(s, a, { type: 'roll' }, dice(5)); // 26 + 5 = 31 -> 3
    expect(s.players.find((p) => p.id === a)!.pos).toBe(3);
    expect(cash(s, a)).toBe(1000 + 200);
  });

  it('pays rent to the owner, doubled for a whole colour set', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = own(s, 'rio', b);
    s = patch(s, a, { pos: 0 });
    // Rio is 1 step away: roll 1+? impossible, so stand at the start of the row.
    s = patch(s, a, { pos: 27 }); // New York, one before Start
    s = play(s, a, { type: 'roll' }, dice(2)); // 2 steps: Start (salary), Rio
    expect(cash(s, a)).toBe(1000 + 200 - 10);
    expect(cash(s, b)).toBe(1050 + 10);
    // With Delhi too the base rent doubles.
    const set = own(own(start(), 'rio', b), 'delhi', b);
    expect(rentOf(set, tileById(set.board, 'rio') as never)).toBe(20);
  });

  it('a six rolls again, with no penalty however often it comes', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    for (const [from, tile] of [
      [0, 'madrid'],
      [6, 'zurich'],
      [12, 'auction'],
    ] as const) {
      s = play(s, a, { type: 'roll' }, dice(6)); // 6 steps
      expect(s.players.find((p) => p.id === a)!.pos).toBe(from + 6);
      expect(tileById(s.board, tile)).toBeDefined();
      if (s.phase === 'buy') {
        s = play(s, a, { type: 'decline' });
        s = play(s, b, { type: 'passBid' });
        s = play(s, a, { type: 'passBid' });
      }
      expect(s.phase).toBe('roll');
      expect(mover(s).id).toBe(a);
    }
    // Three sixes in a row sent nobody to jail; a 3 ends the run.
    expect(s.players.find((p) => p.id === a)!.jail).toBe(0);
    s = play(s, a, { type: 'roll' }, dice(3));
    expect(s.dice).toBe(3);
    expect(s.phase === 'buy' || s.phase === 'roll').toBe(true);
  });

  it('refuses moves out of turn and in the wrong phase', () => {
    const s = start();
    const a = mover(s).id;
    expect(game.validateMove(s, other(s), { type: 'roll' })).toEqual({
      ok: false,
      error: 'Not your turn',
    });
    expect(game.validateMove(s, a, { type: 'tradeCancel' }).ok).toBe(false);
    expect(game.validateMove(s, a, { type: 'buy' })).toEqual({
      ok: false,
      error: 'You cannot do that right now',
    });
  });
});

describe('buildings, selling and net worth', () => {
  it('builds only on a whole set; rent and net worth follow', () => {
    let s = start();
    const a = mover(s).id;
    s = own(s, 'rio', a);
    expect(game.validateMove(s, a, { type: 'build', tile: 'rio' })).toMatchObject({ ok: false });
    s = own(s, 'delhi', a);
    s = play(s, a, { type: 'build', tile: 'rio' });
    expect(s.owned['rio']!.level).toBe(1);
    expect(cash(s, a)).toBe(950);
    // (two owned: 2 x 10, plus the building's 30)
    expect(rentOf(s, tileById(s.board, 'rio') as never)).toBe(50);
    // 950 cash + sell 80 + 80 + one building (half of 50)
    expect(netWorth(s, a)).toBe(950 + 80 + 80 + 25);
    s = play(s, a, { type: 'sellBuilding', tile: 'rio' });
    expect(cash(s, a)).toBe(975);
    s = play(s, a, { type: 'sellProperty', tile: 'delhi' });
    expect(cash(s, a)).toBe(1055);
    expect(s.owned['delhi']).toBeUndefined();
  });

  it('special spaces pay by how many of the four the owner has (35 / 70 / 100 / 140) and cannot be built on', () => {
    let s = own(start(), 'harbor', 'b');
    const rent = (id: string) => rentOf(s, tileById(s.board, id) as never);
    expect(rent('harbor')).toBe(35);
    s = own(s, 'airport', 'b');
    expect(rent('harbor')).toBe(70);
    s = own(s, 'railway', 'b');
    expect(rent('airport')).toBe(100);
    s = own(s, 'electricity', 'b');
    expect(rent('railway')).toBe(140);
    expect(rent('electricity')).toBe(140);
    expect(game.validateMove(s, 'b', { type: 'build', tile: 'harbor' })).toMatchObject({
      ok: false,
    });
  });
});

describe('selling a space', () => {
  it('pays the flat sell price from the bank, puts nothing up for auction, and the space is free again', () => {
    let s = own(start(), 'tokyo', mover(start()).id);
    const a = mover(s).id;
    s = own(s, 'tokyo', a);
    const before = cash(s, a);
    s = play(s, a, { type: 'sellProperty', tile: 'tokyo' });
    expect(cash(s, a)).toBe(before + 335); // 80 % of 420, rounded to 5: a flat fee
    expect(s.auction).toBeNull();
    expect(s.trade).toBeNull();
    expect(s.owned['tokyo']).toBeUndefined();
    expect(s.phase).toBe('roll');
    // An owned space can never be put up for auction: there is no such move any more.
    expect(game.moveSchema.safeParse({ type: 'startAuction', tile: 'rio' }).success).toBe(false);
  });
});

describe('jail', () => {
  /** A player who has just been sent to jail by a card: asked at once. */
  const jailed = (options = OPTIONS) => {
    const s = start(2, options);
    const a = mover(s).id;
    const t = patch(s, a, { pos: idx('jail'), jail: 3 });
    return { s: { ...t, phase: 'jailAsk' as const }, a };
  };

  it('asks at once: nothing but pay or stay is possible', () => {
    const { s, a } = jailed();
    expect(game.validateMove(s, a, { type: 'roll' })).toMatchObject({ ok: false });
    expect(game.validateMove(s, a, { type: 'payJail' }).ok).toBe(true);
    expect(game.validateMove(s, a, { type: 'wait' }).ok).toBe(true);
    expect(game.getCurrentPlayers(s)).toEqual([a]);
  });

  it('paying the fee frees the player at once and the turn goes on', () => {
    const { s, a } = jailed();
    const free = play(s, a, { type: 'payJail' });
    expect(cash(free, a)).toBe(1000 - 150);
    expect(free.players.find((p) => p.id === a)!.jail).toBe(0);
    expect(mover(free).id).toBe(other(s));
  });

  it('staying means three skipped turns and nobody is asked again', () => {
    const { s: s0, a } = jailed({ ...OPTIONS, auctionOnDecline: false, rainbowRoad: false });
    const b = other(s0);
    let s = play(s0, a, { type: 'wait' });
    expect(mover(s).id).toBe(b);
    for (let turn = 1; turn <= 4; turn++) {
      expect(mover(s).id).toBe(b);
      expect(s.phase).toBe('roll');
      s = play(s, b, { type: 'roll' }, dice(3));
      s = play(s, b, { type: 'decline' }); // (it stays free, the turn passes on)
      // The jailed player's turns are skipped by themselves.
      if (turn < 4) expect(game.getCurrentPlayers(s)).toEqual([b]);
    }
    expect(s.players.find((p) => p.id === a)!.jail).toBe(0);
    expect(s.events.filter((e) => e.k === 'jailSkip').length).toBeLessThanOrEqual(1);
    expect(mover(s).id).toBe(a);
    expect(game.validateMove(s, a, { type: 'roll' }).ok).toBe(true);
  });

  it('cannot pay without the money', () => {
    const { s, a } = jailed();
    const poor = patch(s, a, { cash: 100 });
    expect(game.validateMove(poor, a, { type: 'payJail' })).toMatchObject({ ok: false });
  });
});

describe('auctions', () => {
  it('a declined space goes to the highest bidder, one player bids at a time', () => {
    let s = start(3);
    const a = mover(s).id;
    s = play(s, a, { type: 'roll' }, dice(3)); // bangkok 130
    s = play(s, a, { type: 'decline' });
    expect(s.phase).toBe('auction');
    // Only one player is up, in seat order after the mover (the mover is last).
    expect(game.getCurrentPlayers(s)).toHaveLength(1);
    const first = turn(s);
    expect(first).not.toBe(a);
    const second = s.players.map((p) => p.id).find((id) => id !== a && id !== first)!;
    expect(game.validateMove(s, second, { type: 'bid', amount: 100 })).toMatchObject({
      ok: false,
      error: 'Not your turn',
    });
    s = play(s, first, { type: 'bid', amount: 100 });
    expect(s.auction!.bids[first]).toBe(100);
    expect(game.validateMove(s, second, { type: 'bid', amount: 80 })).toMatchObject({ ok: false });
    expect(turn(s)).toBe(second);
    s = play(s, second, { type: 'bid', amount: 110 });
    expect(turn(s)).toBe(a); // (the first bidder is not up: they were topped, and may bid again later)
    s = play(s, a, { type: 'passBid' });
    s = play(s, first, { type: 'passBid' });
    expect(s.owned['bangkok']).toEqual({ owner: second, level: 0 });
    expect(cash(s, second)).toBe(1100 - 110);
    expect(s.phase).toBe('roll');
    expect(mover(s).id).not.toBe(a);
  });

  it('a player who cannot top the highest bid steps out by themselves', () => {
    let s = start(3);
    const a = mover(s).id;
    const [x, y] = s.players.filter((p) => p.id !== a).map((p) => p.id) as [string, string];
    s = patch(s, y, { cash: 100 });
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    if (turn(s) === y) s = play(s, y, { type: 'passBid' });
    s = play(s, x, { type: 'bid', amount: 100 }); // y has exactly 100: cannot raise
    expect(s.auction!.passed).toContain(y);
    expect(game.getCurrentPlayers(s)).toEqual([a]);
  });

  it('an auction has its own 15 second clock, and when it runs out the one who is up steps out', () => {
    let s = start(3);
    const a = mover(s).id;
    expect(game.phaseClockMs!(s)).toBeNull();
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    expect(game.phaseClockMs!(s)).toBe(15_000);
    const x = turn(s);
    s = play(s, x, { type: 'bid', amount: 100 });
    // The time is up for each in turn: they pass.
    while (s.auction) {
      const id = turn(s);
      const t = game.timeoutMove!(s, id, createSeededRng(1));
      expect(t.move).toEqual({ type: 'passBid' });
      s = play(s, id, t.move);
    }
    expect(s.owned['bangkok']).toEqual({ owner: x, level: 0 });
    expect(game.phaseClockMs!(s)).toBeNull();
  });

  it('opens at 70 % of the price at least', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = play(s, a, { type: 'roll' }, dice(3)); // Bangkok, $130: opens at $95
    s = play(s, a, { type: 'decline' });
    expect(s.auction!.min).toBe(95);
    expect(turn(s)).toBe(b);
    expect(game.validateMove(s, b, { type: 'bid', amount: 90 })).toMatchObject({
      ok: false,
      error: 'The opening bid is too low',
    });
    expect(game.validateMove(s, b, { type: 'bid', amount: 95 }).ok).toBe(true);
  });

  it('is skipped when nobody but the player who passed can pay the opening bid', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = patch(s, b, { cash: 90 }); // $5 short of the $95 opening bid
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    expect(s.auction).toBeNull();
    expect(s.owned['bangkok']).toBeUndefined();
    expect(mover(s).id).toBe(b);
    expect(s.phase).toBe('roll');
  });

  it('a player who cannot afford the space does not start an auction', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = patch(s, a, { cash: 100 }); // Bangkok costs $130
    s = play(s, a, { type: 'roll' }, dice(3));
    expect(game.validateMove(s, a, { type: 'buy' })).toMatchObject({ ok: false });
    s = play(s, a, { type: 'decline' });
    expect(s.auction).toBeNull();
    expect(s.owned['bangkok']).toBeUndefined();
    expect(mover(s).id).toBe(b);
  });

  it('with the setting off, not buying just leaves the space free', () => {
    let s = start(2, { ...OPTIONS, auctionOnDecline: false, rainbowRoad: false });
    const a = mover(s).id;
    const b = other(s);
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    expect(s.auction).toBeNull();
    expect(s.owned['bangkok']).toBeUndefined();
    expect(mover(s).id).toBe(b);
    expect(s.phase).toBe('roll');
  });

  it('with no bids the space stays with the bank', () => {
    let s = start();
    const a = mover(s).id;
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    s = play(s, other(s), { type: 'passBid' });
    s = play(s, a, { type: 'passBid' });
    expect(s.owned['bangkok']).toBeUndefined();
    expect(s.phase).toBe('roll');
    expect(mover(s).id).not.toBe(a);
  });

  it('a bank sale pays no bonus', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    s = play(s, b, { type: 'bid', amount: 100 });
    s = play(s, a, { type: 'passBid' });
    expect(cash(s, b)).toBe(1050 - 100);
    expect(cash(s, a)).toBe(1000);
  });
});

describe('the trade on the Auction corner', () => {
  const corner = (n = 2) => {
    let s = start(n);
    const a = mover(s).id;
    const others = s.players.filter((p) => p.id !== a).map((p) => p.id);
    s = own(own(s, 'rio', a), 'madrid', others[0]!);
    if (others[1]) s = own(s, 'zurich', others[1]);
    s = patch(s, a, { pos: idx('auction') - 4 });
    s = play(s, a, { type: 'roll' }, dice(4));
    return { s, a, others };
  };

  it('starts when the mover stops on the corner and both sides have a space', () => {
    const { s, a } = corner();
    expect(s.phase).toBe('trade');
    expect(s.trade).toMatchObject({ by: a, stage: 'pick', give: null });
    expect(game.getCurrentPlayers(s)).toEqual([a]);
    expect(game.phaseClockMs!(s)).toBe(90_000);
  });

  it('does not start when somebody has nothing to trade', () => {
    let s = start();
    const a = mover(s).id;
    s = own(s, 'rio', a); // the other player owns nothing
    s = patch(s, a, { pos: idx('auction') - 4 });
    s = play(s, a, { type: 'roll' }, dice(4));
    expect(s.trade).toBeNull();
    expect(s.phase).toBe('roll');
    expect(mover(s).id).not.toBe(a);
  });

  it('the mover picks, the others offer or pass, the mover accepts one: swapped, +$100 each', () => {
    const { s: s0, a, others } = corner(3);
    const [b, c] = others as [string, string];
    let s = play(s0, a, { type: 'tradePick', tile: 'rio' });
    expect(s.trade!.stage).toBe('offers');
    expect(game.getCurrentPlayers(s).sort()).toEqual([b, c].sort());
    expect(game.validateMove(s, b, { type: 'tradeOffer', tile: 'zurich' })).toMatchObject({
      ok: false,
    });
    s = play(s, b, { type: 'tradeOffer', tile: 'madrid' });
    expect(game.getCurrentPlayers(s)).toEqual([c]);
    expect(game.keepsClock!(s0, s)).toBe(false);
    s = play(s, c, { type: 'tradePass' });
    expect(s.trade!.stage).toBe('choose');
    expect(game.getCurrentPlayers(s)).toEqual([a]);
    const cashA = cash(s, a);
    const cashB = cash(s, b);
    s = play(s, a, { type: 'tradeAccept', from: b });
    expect(s.owned['rio']).toEqual({ owner: b, level: 0 });
    expect(s.owned['madrid']).toEqual({ owner: a, level: 0 });
    expect(cash(s, a)).toBe(cashA + 100);
    expect(cash(s, b)).toBe(cashB + 100);
    expect(s.trade).toBeNull();
    expect(mover(s).id).not.toBe(a);
  });

  it('the mover can cancel at the start, and take none of the offers', () => {
    const { s, a, others } = corner();
    const cancelled = play(s, a, { type: 'tradeCancel' });
    expect(cancelled.owned['rio']!.owner).toBe(a);
    expect(cancelled.trade).toBeNull();
    let t = play(s, a, { type: 'tradePick', tile: 'rio' });
    t = play(t, others[0]!, { type: 'tradeOffer', tile: 'madrid' });
    expect(t.trade!.stage).toBe('choose');
    t = play(t, a, { type: 'tradeCancel' });
    expect(t.owned['rio']!.owner).toBe(a);
    expect(t.owned['madrid']!.owner).toBe(others[0]);
  });

  it('when everybody passes the trade is over, and the clock steps everybody out', () => {
    const { s: s0, a, others } = corner(3);
    let s = play(s0, a, { type: 'tradePick', tile: 'rio' });
    for (const id of game.getCurrentPlayers(s)) {
      const t = game.timeoutMove!(s, id, createSeededRng(1));
      expect(t.move).toEqual({ type: 'tradePass' });
      s = play(s, id, t.move);
    }
    expect(s.trade).toBeNull();
    expect(s.owned['rio']!.owner).toBe(a);
    // The mover who does not pick in time cancels.
    const waiting = game.timeoutMove!(s0, a, createSeededRng(1));
    expect(waiting.move).toEqual({ type: 'tradeCancel' });
    void others;
  });

  it('only spaces without buildings can be traded', () => {
    const { s, a } = corner();
    const built = own(s, 'rio', a, 1);
    expect(game.validateMove(built, a, { type: 'tradePick', tile: 'rio' })).toMatchObject({
      ok: false,
    });
  });
});

describe('trade: passing while the mover is still choosing', () => {
  it('the trade is cancelled when every other player passes before the pick', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = own(own(s, 'rio', a), 'cairo', b);
    s = { ...s, phase: 'trade', trade: { by: a, stage: 'pick', give: null, offers: {} } };
    expect(game.validateMove(s, b, { type: 'tradePass' })).toMatchObject({ ok: true });
    s = play(s, b, { type: 'tradePass' });
    expect(s.trade).toBeNull();
  });
  it('an early pass stays a pass when the mover picks', () => {
    let s = start(3);
    const a = mover(s).id;
    const [b, c] = s.players.map((p) => p.id).filter((id) => id !== a) as [string, string];
    s = own(own(own(s, 'rio', a), 'cairo', b), 'madrid', c);
    s = { ...s, phase: 'trade', trade: { by: a, stage: 'pick', give: null, offers: {} } };
    s = play(s, b, { type: 'tradePass' });
    expect(s.trade?.stage).toBe('pick');
    s = play(s, a, { type: 'tradePick', tile: 'rio' });
    expect(s.trade?.stage).toBe('offers');
    expect(s.trade?.offers[b]).toBeNull();
  });
});

describe('rent grows with the spaces of one colour you own', () => {
  it('1 x the base rent for one, 2 x for two, 3 x for three', () => {
    let s = start(2);
    const a = mover(s).id;
    const base = (tileById(DEFAULT_BOARD, 'madrid') as { rent: number[] }).rent[0]!;
    s = own(s, 'madrid', a);
    expect(rentOf(s, tileById(DEFAULT_BOARD, 'madrid') as never)).toBe(base);
    s = own(s, 'cairo', a);
    expect(rentOf(s, tileById(DEFAULT_BOARD, 'madrid') as never)).toBe(base * 2);
    expect(rentOf(s, tileById(DEFAULT_BOARD, 'cairo') as never)).toBe(base * 2);
    s = own(s, 'bangkok', a);
    expect(rentOf(s, tileById(DEFAULT_BOARD, 'madrid') as never)).toBe(base * 3);
    // (somebody else's space of that colour does not count)
    s = own(s, 'bangkok', other(s));
    expect(rentOf(s, tileById(DEFAULT_BOARD, 'madrid') as never)).toBe(base * 2);
  });
});

describe('Rainbow Road', () => {
  const road = (on = true) => {
    let s = start(3, { ...OPTIONS, rainbowRoad: on });
    const [a, b, c] = s.players.map((p) => p.id) as [string, string, string];
    const first = mover(s).id;
    const [x, y] = [a, b, c].filter((id) => id !== first) as [string, string];
    s = own(own(s, 'cairo', x), 'bangkok', y);
    s = patch(s, first, { pos: idx('madrid') - 3 });
    return { s, first, x, y };
  };
  it('offers the road, and selling pays the two owners the sell price', () => {
    const { s, first, x, y } = road();
    const landed = play(s, first, { type: 'roll' }, dice(3));
    expect(landed.phase).toBe('buy');
    expect(game.validateMove(landed, first, { type: 'rainbow' }).ok).toBe(true);
    const before = [cash(landed, x), cash(landed, y), cash(landed, first)];
    const done = play(landed, first, { type: 'rainbow' });
    const sell = (id: string) => (tileById(DEFAULT_BOARD, id) as { sell: number }).sell;
    expect(cash(done, x)).toBe(before[0]! + sell('cairo'));
    expect(cash(done, y)).toBe(before[1]! + sell('bangkok'));
    expect(cash(done, first)).toBe(before[2]);
    expect(done.owned['cairo']).toBeUndefined();
    expect(done.owned['bangkok']).toBeUndefined();
    expect(done.events.some((e) => e.k === 'rainbow')).toBe(true);
    expect(done.phase).not.toBe('buy');
  });
  it('computers take the road when it is offered (they do not buy the third space)', () => {
    const { s, first } = road();
    const landed = play(s, first, { type: 'roll' }, dice(3));
    expect(game.autoMove!(landed, first, createSeededRng(1)).move).toEqual({ type: 'rainbow' });
  });
  it('a plain purchase that makes three different owners sells the street too', () => {
    const { s, first } = road();
    const landed = play(s, first, { type: 'roll' }, dice(3));
    const done = play(landed, first, { type: 'buy' });
    expect(done.events.some((e) => e.k === 'rainbow')).toBe(true);
    expect(done.owned['madrid']).toBeUndefined();
    expect(done.owned['cairo']).toBeUndefined();
  });
  it('is not offered when the option is off', () => {
    const { s, first } = road(false);
    const landed = play(s, first, { type: 'roll' }, dice(3));
    expect(game.validateMove(landed, first, { type: 'rainbow' }).ok).toBe(false);
  });
  it('counts as a Rainbow Road when an auction winner completes the street', () => {
    const four = [...people, { id: 'd', nickname: 'D', avatar: 'bear' }];
    let s = game.createInitialState(four, { ...OPTIONS, rainbowRoad: true }, createSeededRng(7));
    const mv = mover(s).id;
    const [x, y, z] = s.players.map((p) => p.id).filter((id) => id !== mv) as [
      string,
      string,
      string,
    ];
    s = own(own(s, 'cairo', x), 'bangkok', y);
    s = patch(s, mv, { pos: idx('madrid') - 3 });
    s = play(s, mv, { type: 'roll' }, dice(3));
    expect(game.validateMove(s, mv, { type: 'rainbow' }).ok).toBe(true);
    s = play(s, mv, { type: 'decline' }); // not taken: it goes to auction
    expect(s.phase).toBe('auction');
    const before = cash(s, z);
    const bid = s.auction!.min;
    while (s.auction) {
      const id = turn(s);
      s = play(
        s,
        id,
        id === z && !s.auction.high ? { type: 'bid', amount: bid } : { type: 'passBid' },
      );
    }
    expect(s.events.some((e) => e.k === 'rainbow')).toBe(true);
    expect(s.owned['madrid']).toBeUndefined();
    expect(s.owned['cairo']).toBeUndefined();
    const sell = (id: string) => (tileById(DEFAULT_BOARD, id) as { sell: number }).sell;
    expect(cash(s, z)).toBe(before - bid + sell('madrid'));
  });
  it('needs two different owners', () => {
    const { s, first, x } = road();
    const same = own(s, 'bangkok', x);
    const landed = play(same, first, { type: 'roll' }, dice(3));
    expect(game.validateMove(landed, first, { type: 'rainbow' }).ok).toBe(false);
  });
});

describe('bankruptcy and winning', () => {
  it('cash can go to -500, below that a player is out and their spaces go back to the bank', () => {
    let s = start(3);
    const [a, b, c] = s.players.map((p) => p.id) as [string, string, string];
    s = own(own(own(s, 'madrid', c), 'cairo', c), 'bangkok', c);
    s = own(s, 'rio', a);
    s = patch(s, a, { pos: idx('madrid') - 3, cash: -480 });
    s = play(s, a, { type: 'roll' }, dice(3)); // 20 x2 (the whole blue set) = 40 rent -> -520
    const out = s.players.find((p) => p.id === a)!;
    expect(out.bankrupt).toBe(true);
    expect(s.owned['rio']).toBeUndefined();
    expect(mover(s).id).toBe(b);
    // Still alive at exactly -500.
    let t = patch(own(start(), 'madrid', 'b'), 'a', { pos: idx('madrid') - 3, cash: -460 });
    t = patch(t, 'a', {}); // (the seat order is random: 'a' moves first only if the draw says so)
    const first = mover(t).id;
    t = patch(t, first, { pos: idx('madrid') - 3, cash: -460 });
    t = own(t, 'madrid', first === 'a' ? 'b' : 'a');
    t = play(t, first, { type: 'roll' }, dice(3));
    expect(t.players.find((p) => p.id === first)!.bankrupt).toBe(false);
    expect(t.players.find((p) => p.id === first)!.cash).toBe(
      -460 - (tileById(DEFAULT_BOARD, 'madrid') as { rent: number[] }).rent[0]!,
    );
  });

  it('a six that bankrupts the mover does not give them another roll', () => {
    let s = start(3);
    const [a, b, c] = s.players.map((p) => p.id) as [string, string, string];
    s = own(own(own(s, 'madrid', c), 'cairo', c), 'bangkok', c);
    s = patch(s, a, { pos: idx('madrid') - 6, cash: -480 });
    s = { ...s, turn: 0 };
    s = play(s, a, { type: 'roll' }, dice(6));
    expect(s.players.find((p) => p.id === a)!.bankrupt).toBe(true);
    expect(mover(s).id).not.toBe(a);
    expect(s.phase).toBe('roll');
    expect(s.sixes).toBe(0);
    void b;
  });

  it('the last player standing wins', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = own(s, 'madrid', b);
    s = patch(s, a, { pos: idx('madrid') - 3, cash: -499 });
    s = play(s, a, { type: 'roll' }, dice(3));
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(b);
    expect(game.isGameOver(s)).toBe(true);
    const r = game.getResults(s).rankings;
    expect(r[0]).toMatchObject({ playerId: b, rank: 1 });
    expect(r[1]).toMatchObject({ playerId: a, rank: 2 });
  });

  it('the first to reach the net worth target wins', () => {
    let s = start(2, { ...OPTIONS, target: 3000 });
    const a = mover(s).id;
    const b = other(s);
    s = patch(s, a, { cash: 2990 });
    s = play(s, a, { type: 'roll' }, dice(3)); // stops on Bangkok
    s = play(s, a, { type: 'buy' }); // 2860 cash + 105 sell value = 2965: not yet
    expect(s.phase).not.toBe('over');
    s = patch(s, a, { cash: 3100 });
    s = play(s, b, { type: 'roll' }, dice(2)); // anything: the check runs after every move
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(a);
  });

  it('at the round limit the richest player wins', () => {
    let s = start(2, { ...OPTIONS, turns: 1 });
    const a = mover(s).id;
    const b = other(s);
    s = patch(s, b, { cash: 1800 });
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    s = play(s, b, { type: 'passBid' });
    s = play(s, a, { type: 'passBid' });
    expect(s.phase).toBe('roll');
    expect(mover(s).id).toBe(b);
    s = play(s, b, { type: 'roll' }, dice(3));
    s = play(s, b, { type: 'decline' });
    s = play(s, a, { type: 'passBid' });
    s = play(s, b, { type: 'passBid' });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(b);
  });
});

describe('computer players', () => {
  it('play whole games to the end (with a round limit) without ever making an illegal move', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = createSeededRng(seed);
      let s = game.createInitialState(people, { ...OPTIONS, turns: 20 }, rng);
      let guard = 0;
      while (!game.isGameOver(s)) {
        if (++guard > 20000) throw new Error(`game ${seed} did not finish`);
        const who = game.getCurrentPlayers(s)[0]!;
        const { move } = game.autoMove!(s, who, rng);
        const check = game.validateMove(s, who, move);
        if (!check.ok) throw new Error(`illegal bot move ${JSON.stringify(move)}: ${check.error}`);
        s = game.applyMove(s, who, move, rng);
      }
      expect(s.winner).not.toBeNull();
      expect(game.getResults(s).rankings).toHaveLength(3);
    }
  });
});

describe('the repair bill card', () => {
  it('never bankrupts you: it only takes what the debt limit allows', () => {
    const board = {
      ...DEFAULT_BOARD,
      cards: [
        {
          text: 'Repair bill: pay $40 for every building you own',
          effect: { type: 'perBuilding' as const, amount: -40 },
        },
      ],
    };
    let s: BankruptState = { ...start(), board };
    const a = mover(s).id;
    s = own(own(s, 'rio', a, 3), 'delhi', a, 2); // 5 buildings = $200
    s = patch(s, a, { cash: -450, pos: idx('cards') - 3 });
    s = play(s, a, { type: 'roll' }, dice(3, 1));
    expect(s.players.find((p) => p.id === a)!.bankrupt).toBe(false);
    expect(cash(s, a)).toBe(DEFAULT_BOARD.bankruptBelow);
  });
});

describe('Free Froggo (the others pay the bail)', () => {
  /** p0 waits in jail, p1 (jailed) is next: the vote starts. */
  const voting = (cashOfLast?: number) => {
    let s = start(3, { ...OPTIONS, freeFroggo: true });
    const [p0, p1, p2] = s.players.map((p) => p.id) as [string, string, string];
    s = patch(s, p0, { jail: 3, pos: idx('jail') });
    s = patch(s, p1, { jail: 2, pos: idx('jail') });
    if (cashOfLast !== undefined) s = patch(s, p2, { cash: cashOfLast });
    s = { ...s, phase: 'jailAsk' };
    return { s: play(s, p0, { type: 'wait' }), p0, p1, p2 };
  };
  it('asks everybody else when a jailed player comes up, and frees them when all pay', () => {
    const { s, p0, p1, p2 } = voting();
    expect(s.phase).toBe('bail');
    expect(s.bail).toMatchObject({ subject: p1, amount: 50, voters: [p0, p2] });
    expect(game.getCurrentPlayers(s).sort()).toEqual([p0, p2].sort());
    let t = play(s, p0, { type: 'bailPay' });
    expect(t.phase).toBe('bail');
    expect(game.getCurrentPlayers(t)).toEqual([p2]);
    t = play(t, p2, { type: 'bailPay' });
    expect(t.phase).toBe('roll');
    expect(mover(t).id).toBe(p1);
    expect(t.players.find((p) => p.id === p1)!.jail).toBe(0);
    expect(cash(t, p0)).toBe(cash(s, p0) - 50);
    expect(cash(t, p2)).toBe(cash(s, p2) - 50);
    expect(cash(t, p1)).toBe(cash(s, p1));
    expect(t.events.some((e) => e.k === 'bail')).toBe(true);
    expect(t.bail).toBeNull();
  });
  it('one no ends the vote: nobody pays and the jailed turn is sat out', () => {
    const { s, p0, p1, p2 } = voting();
    const t = play(play(s, p0, { type: 'bailPay' }), p2, { type: 'bailRefuse' });
    expect(t.bail).toBeNull();
    expect(cash(t, p0)).toBe(cash(s, p0));
    expect(t.players.find((p) => p.id === p1)!.jail).toBe(1);
    expect(mover(t).id).toBe(p2);
    expect(t.phase).toBe('roll');
    expect(t.events.some((e) => e.k === 'bailRefused')).toBe(true);
  });
  it('is not asked when somebody cannot afford the bail, or when the switch is off', () => {
    const poor = voting(20).s;
    expect(poor.bail).toBeNull();
    expect(poor.players.find((p) => p.jail === 1)).toBeDefined();
    let s = start(3);
    const [p0, p1] = s.players.map((p) => p.id) as [string, string];
    s = patch(patch(s, p0, { jail: 3, pos: idx('jail') }), p1, { jail: 2, pos: idx('jail') });
    s = play({ ...s, phase: 'jailAsk' }, p0, { type: 'wait' });
    expect(s.bail).toBeNull();
  });
  it('computers always pay, and a clock that runs out says no', () => {
    const { s, p0 } = voting();
    expect(game.autoMove!(s, p0, createSeededRng(1)).move).toEqual({ type: 'bailPay' });
    expect(game.timeoutMove!(s, p0, createSeededRng(1)).move).toEqual({ type: 'bailRefuse' });
    expect(game.phaseClockMs!(s)).toBe(15000);
  });
  it('the jailed player and a repeat answer cannot vote', () => {
    const { s, p0, p1 } = voting();
    expect(game.validateMove(s, p1, { type: 'bailPay' }).ok).toBe(false);
    const t = play(s, p0, { type: 'bailPay' });
    expect(game.validateMove(t, p0, { type: 'bailPay' }).ok).toBe(false);
  });
});

describe('auction bid step', () => {
  it('scales from $5 on the cheap spaces to $20 on the dearest', () => {
    expect([100, 150, 200, 300, 420, 450].map(bidStep)).toEqual([5, 5, 10, 15, 20, 20]);
  });
});

describe('the Auction corner with computers', () => {
  it('does not even open the pick when the only possible traders are computers', () => {
    const people2 = [
      { id: 'h', nickname: 'H', avatar: 'fox' },
      { id: 'r1', nickname: 'R1', avatar: 'owl', bot: true },
    ];
    let s = game.createInitialState(people2, OPTIONS, createSeededRng(7));
    const h = mover(s).id;
    const r = s.players.find((p) => p.id !== h)!.id;
    s = own(own(s, 'rio', h), 'delhi', r);
    s = patch(s, h, { pos: idx('auction') - 2 });
    const landed = play(s, h, { type: 'roll' }, dice(2));
    expect(landed.trade).toBeNull();
    expect(landed.events.some((e) => e.k === 'tradeNone')).toBe(true);
    expect(landed.phase).not.toBe('trade');
  });
});

describe('the special wheel', () => {
  const on: BankruptOptions = { ...OPTIONS, specialWheel: true };
  /** The mover stands on Start; faces for the dice: a number 1-6 is a die; for the special wheel the value is the slice index. */
  it('the 4th roll after three sixes spins the special wheel; a number moves as usual', () => {
    let s: BankruptState = start(2, on);
    const a = mover(s).id;
    s = { ...s, sixes: 3 };
    // slice 4 of the special wheel is '3'
    const t = play(s, a, { type: 'roll' }, dice(4));
    const ev = t.events.find((e) => e.k === 'roll');
    expect(ev).toMatchObject({ dice: 3, wheel: { idx: 3, slice: '3' } });
    expect(t.players.find((p) => p.id === a)!.pos).toBe(3);
    expect(t.sixes).toBe(0);
  });
  it('$50 pays from the bank and the turn ends; JAIL sends the frog to jail', () => {
    const s0 = start(2, on);
    const a = mover(s0).id;
    const wheelAt = (slice: string) =>
      (bankrupt.SPECIAL_SLICES as readonly string[]).indexOf(slice) + 1; // (dice() faces are 1-based)
    const s = { ...s0, sixes: 3 };
    const rich = play(s, a, { type: 'roll' }, dice(wheelAt('$50')));
    expect(cash(rich, a)).toBe(cash(s, a) + 50);
    expect(rich.players.find((p) => p.id === a)!.pos).toBe(0);
    expect(mover(rich).id).not.toBe(a); // (no walking, the turn is over)
    const jailed = play(s, a, { type: 'roll' }, dice(wheelAt('JAIL')));
    expect(jailed.players.find((p) => p.id === a)!.jail).toBeGreaterThan(0);
    expect(jailed.events.some((e) => e.k === 'jail')).toBe(true);
  });
  it('a fortunate-wheel card makes the next roll the special wheel, once', () => {
    let s: BankruptState = start(2, on);
    const a = mover(s).id;
    s = patch(s, a, { wheel: true });
    const t = play(s, a, { type: 'roll' }, dice(1));
    expect(t.events.find((e) => e.k === 'roll')).toMatchObject({ wheel: { slice: '1' } });
    expect(t.players.find((p) => p.id === a)!.wheel).toBe(false);
  });
  it('does nothing when the option is off', () => {
    let s: BankruptState = start(2, { ...on, specialWheel: false });
    const a = mover(s).id;
    s = { ...patch(s, a, { wheel: true }), sixes: 3 };
    const t = play(s, a, { type: 'roll' }, dice(2));
    expect(t.events.find((e) => e.k === 'roll')).not.toHaveProperty('wheel');
  });
});

describe('the luck-card deck', () => {
  it('deals every card once before any comes again, then shuffles anew', () => {
    const cards = [10, 20, 30].map((n) => ({
      text: `gift ${n}`,
      effect: { type: 'cash' as const, amount: n },
    }));
    let s: BankruptState = { ...start(), board: { ...DEFAULT_BOARD, cards } };
    // a rng that rolls 1 and makes the shuffle come out as [1, 2, 0]
    const rng = { int: (n: number) => (n === 6 ? 0 : 0) };
    const got: number[] = [];
    for (let k = 0; k < 4; k++) {
      const a = mover(s).id;
      s = patch(s, a, { pos: idx('cards') - 1 });
      const before = cash(s, a);
      s = game.applyMove(s, a, { type: 'roll' }, rng);
      got.push(cash(s, a) - before);
    }
    // the first three draws are all three cards (once each), the 4th starts a new shuffle
    expect([...got.slice(0, 3)].sort((x, y) => x - y)).toEqual([10, 20, 30]);
    expect(got[3]).toBe(got[0]);
    // the view does not show the order of the cards to come
    expect(game.getPlayerView(s, mover(s).id).deck.every((i) => i === -1)).toBe(true);
  });
});
