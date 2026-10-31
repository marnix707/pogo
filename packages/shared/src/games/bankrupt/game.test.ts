import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import { createDiceRng } from '../../game/testing';
import { boardConfigSchema, DEFAULT_BOARD } from './config';
import { bankruptGame as game } from './game';
import { mover, netWorth, rentOf, tileById, tileIndex } from './rules';
import type { BankruptMove, BankruptOptions, BankruptState } from './types';

const people = [
  { id: 'a', nickname: 'A', avatar: 'fox' },
  { id: 'b', nickname: 'B', avatar: 'cat' },
  { id: 'c', nickname: 'C', avatar: 'owl' },
];
const OPTIONS: BankruptOptions = { target: 0, turns: 0, auctionOnDecline: true };

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
const cash = (s: BankruptState, id: string) => s.players.find((p) => p.id === id)!.cash;
const idx = (id: string) => tileIndex(DEFAULT_BOARD, id);
const other = (s: BankruptState) => s.players.find((p) => p.id !== mover(s).id)!.id;

describe('Bankrupt! board and set-up', () => {
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
    expect(game.validateMove(s, a, { type: 'endTurn' }).ok).toBe(false);
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
    expect(s.phase === 'buy' || s.phase === 'after').toBe(true);
  });

  it('refuses moves out of turn and in the wrong phase', () => {
    const s = start();
    const a = mover(s).id;
    expect(game.validateMove(s, other(s), { type: 'roll' })).toEqual({
      ok: false,
      error: 'Not your turn',
    });
    expect(game.validateMove(s, a, { type: 'endTurn' })).toEqual({
      ok: false,
      error: 'Roll the dice first',
    });
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
    expect(rentOf(s, tileById(s.board, 'rio') as never)).toBe(30);
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

describe('jail', () => {
  const jailed = () => {
    const s = start();
    const a = mover(s).id;
    return { s: patch(patch(s, a, { pos: idx('jail'), jail: 3 }), a, {}), a };
  };

  it('can be left by paying the fee', () => {
    const { s, a } = jailed();
    expect(game.validateMove(s, a, { type: 'roll' })).toMatchObject({ ok: false });
    const free = play(s, a, { type: 'payJail' });
    expect(cash(free, a)).toBe(1000 - 150);
    expect(free.players.find((p) => p.id === a)!.jail).toBe(0);
    expect(free.phase).toBe('roll');
  });

  it('can be waited out: three turns', () => {
    const { s: s0, a } = jailed();
    let s = s0;
    const b = other(s);
    for (let i = 0; i < 3; i++) {
      expect(mover(s).id).toBe(a);
      s = play(s, a, { type: 'wait' });
      s = play(s, b, { type: 'roll' }, dice(3)); // b plays a turn
      s = play(s, b, { type: 'decline' });
      s = play(s, a, { type: 'passBid' });
      s = play(s, b, { type: 'passBid' }); // (the turn then ends by itself)
    }
    expect(s.players.find((p) => p.id === a)!.jail).toBe(0);
    expect(game.validateMove(s, a, { type: 'roll' }).ok).toBe(true);
  });
});

describe('auctions', () => {
  it('a declined space goes to the highest bidder', () => {
    let s = start(3);
    const a = mover(s).id;
    s = play(s, a, { type: 'roll' }, dice(3)); // bangkok 130
    s = play(s, a, { type: 'decline' });
    expect(s.phase).toBe('auction');
    const [x, y] = s.players.filter((p) => p.id !== a).map((p) => p.id) as [string, string];
    expect(game.getCurrentPlayers(s).sort()).toEqual([a, x, y].sort());
    s = play(s, x, { type: 'bid', amount: 60 });
    expect(game.validateMove(s, x, { type: 'bid', amount: 80 })).toMatchObject({ ok: false });
    expect(game.getCurrentPlayers(s)).not.toContain(x);
    s = play(s, y, { type: 'bid', amount: 90 });
    s = play(s, a, { type: 'passBid' });
    s = play(s, x, { type: 'passBid' });
    expect(s.owned['bangkok']).toEqual({ owner: y, level: 0 });
    expect(cash(s, y)).toBe(1100 - 90);
    expect(s.phase).toBe('roll');
    expect(mover(s).id).not.toBe(a);
  });

  it('a player who cannot top the highest bid steps out by themselves', () => {
    let s = start(3);
    const a = mover(s).id;
    const [x, y] = s.players.filter((p) => p.id !== a).map((p) => p.id) as [string, string];
    s = patch(s, y, { cash: 80 });
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    expect(game.getCurrentPlayers(s)).toContain(y);
    s = play(s, x, { type: 'bid', amount: 80 }); // y has exactly 80: cannot raise
    expect(s.auction!.passed).toContain(y);
    expect(game.getCurrentPlayers(s)).not.toContain(y);
    expect(game.getCurrentPlayers(s)).toEqual([a]);
  });

  it('an auction has its own 15 second clock and the clock steps everybody out', () => {
    let s = start(3);
    const a = mover(s).id;
    expect(game.phaseClockMs!(s)).toBeNull();
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    expect(game.phaseClockMs!(s)).toBe(15_000);
    const [x] = s.players.filter((p) => p.id !== a).map((p) => p.id) as [string];
    s = play(s, x, { type: 'bid', amount: 50 });
    // The time is up: everybody who has not bid passes.
    for (const id of game.getCurrentPlayers(s)) {
      const t = game.timeoutMove!(s, id, createSeededRng(1));
      expect(t.move).toEqual({ type: 'passBid' });
      s = play(s, id, t.move);
    }
    expect(s.owned['bangkok']).toEqual({ owner: x, level: 0 });
    expect(game.phaseClockMs!(s)).toBeNull();
  });

  it('with the setting off, not buying just leaves the space free', () => {
    let s = start(2, { ...OPTIONS, auctionOnDecline: false });
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

  it('a seller on the Auction corner can sell one space or cancel', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = own(s, 'rio', a);
    s = patch(s, a, { pos: idx('auction') - 4 });
    s = play(s, a, { type: 'roll' }, dice(4));
    expect(s.auctionRight).toBe(true);
    s = play(s, a, { type: 'startAuction', tile: 'rio' });
    expect(game.getCurrentPlayers(s)).toEqual([b]);
    expect(game.validateMove(s, b, { type: 'cancelAuction' })).toMatchObject({ ok: false });
    const cancelled = play(s, a, { type: 'cancelAuction' });
    expect(cancelled.owned['rio']!.owner).toBe(a);
    expect(mover(cancelled).id).toBe(b);
    s = play(s, b, { type: 'bid', amount: 70 });
    expect(s.owned['rio']).toEqual({ owner: b, level: 0 });
    // Selling to another player is a trade: the bank gives both a $100 bonus.
    expect(cash(s, a)).toBe(1000 + 70 + 100);
    expect(cash(s, b)).toBe(1050 - 70 + 100);
  });

  it('only a player-to-player sale pays the bonus; the bank sale does not', () => {
    let s = start();
    const a = mover(s).id;
    const b = other(s);
    s = play(s, a, { type: 'roll' }, dice(3));
    s = play(s, a, { type: 'decline' });
    s = play(s, b, { type: 'bid', amount: 60 });
    s = play(s, a, { type: 'passBid' });
    expect(cash(s, b)).toBe(1050 - 60);
    expect(cash(s, a)).toBe(1000);
    expect(s.events.find((e) => e.k === 'auction')).toMatchObject({ winner: b, bonus: 0 });
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
    expect(t.players.find((p) => p.id === first)!.cash).toBe(-480);
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
