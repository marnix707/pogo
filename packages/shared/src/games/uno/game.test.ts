import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import type { GamePlayer } from '../../game/types';
import { DECK_SIZE, canPlayCard, cardInfo, isSpecial } from './cards';
import type { Card } from './cards';
import { unoGame as game } from './game';
import type { UnoMove, UnoState } from './types';

const players = (n: number): GamePlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, avatar: 'fox' }));

// Card ids: red 0-24 (0 = "0", 1-9 numbers, 19-20 skip, 21-22 reverse, 23-24 draw two),
// yellow 25-49, green 50-74, blue 75-99, wild 100-103, wild four 104-107.
const RED = (n: number) => n; // 1-9
const YELLOW = (n: number) => 25 + n;
const RED_SKIP = 19;
const RED_REVERSE = 21;
const RED_DRAW2 = 23;
const YELLOW_SKIP = 25 + 19;
const WILD = 100;
const WILD4 = 104;

const rng = createSeededRng(7);

/** A state with chosen hands: p0 to move, red on top (a red 5). */
function setup(hands: Card[][], over: Partial<UnoState> = {}): UnoState {
  const used = new Set(hands.flat());
  used.add(RED(5));
  const stock = Array.from({ length: DECK_SIZE }, (_, i) => i).filter((c) => !used.has(c));
  return {
    players: hands.map((hand, i) => ({ id: `p${i}`, hand, called: false })),
    stock,
    pile: [RED(5)],
    color: 0,
    turn: 0,
    direction: 1,
    drawn: null,
    winner: null,
    eventSeq: 0,
    lastEvent: null,
    unoCall: null,
    ...over,
  };
}
const play = (s: UnoState, id: string, move: UnoMove) => game.applyMove(s, id, move, rng);

describe('cards', () => {
  it('the deck has the standard 108 cards', () => {
    const kinds: Record<string, number> = {};
    for (let c = 0; c < DECK_SIZE; c++) {
      const k = cardInfo(c).kind;
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    expect(kinds).toEqual({ number: 76, skip: 8, reverse: 8, draw2: 8, wild: 4, wild4: 4 });
    // One 0 and two of each 1-9 per colour.
    const reds = Array.from({ length: 25 }, (_, i) => cardInfo(i)).filter(
      (i) => i.kind === 'number',
    );
    expect(reds.filter((i) => i.value === 0)).toHaveLength(1);
    expect(reds.filter((i) => i.value === 9)).toHaveLength(2);
  });

  it('matches by colour or symbol, wilds always; Wild Draw Four only without the colour', () => {
    expect(canPlayCard(RED(7), RED(5), 0, [])).toBe(true);
    expect(canPlayCard(YELLOW(5), RED(5), 0, [])).toBe(true); // same number
    expect(canPlayCard(YELLOW(6), RED(5), 0, [])).toBe(false);
    expect(canPlayCard(YELLOW_SKIP, RED_SKIP, 0, [])).toBe(true); // same symbol
    expect(canPlayCard(WILD, RED(5), 0, [RED(1)])).toBe(true);
    expect(canPlayCard(WILD4, RED(5), 0, [RED(1), WILD4])).toBe(false);
    expect(canPlayCard(WILD4, RED(5), 0, [YELLOW(1), WILD4])).toBe(true);
    // After a wild only the chosen colour counts.
    expect(canPlayCard(YELLOW(5), WILD, 2, [])).toBe(false);
  });
});

describe('start', () => {
  it('deals seven each and starts on a number card', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = game.createInitialState(players(4), {}, createSeededRng(seed));
      expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
      expect(isSpecial(s.pile[0]!)).toBe(false);
      expect(s.stock.length + s.players.length * 7 + 1).toBe(DECK_SIZE);
    }
  });
});

describe('playing', () => {
  it('plays a matching card and passes the turn; refuses a mismatch and a wrong turn', () => {
    const s = setup([
      [RED(7), YELLOW(9)],
      [RED(1), RED(2)],
    ]);
    expect(game.validateMove(s, 'p0', { type: 'play', card: YELLOW(9) }).ok).toBe(false);
    expect(game.validateMove(s, 'p1', { type: 'play', card: RED(1) }).ok).toBe(false);
    const next = play(s, 'p0', { type: 'play', card: RED(7) });
    expect(next.turn).toBe(1);
    expect(next.pile.at(-1)).toBe(RED(7));
  });

  it('a wild needs a colour and sets it', () => {
    const s = setup([[WILD, RED(1)], [RED(2)]]);
    expect(game.validateMove(s, 'p0', { type: 'play', card: WILD }).ok).toBe(false);
    const next = play(s, 'p0', { type: 'play', card: WILD, color: 3 });
    expect(next.color).toBe(3);
  });

  it('skip, reverse and the two-player reverse', () => {
    const three = setup([
      [RED_SKIP, RED(1)],
      [RED(2), RED(4)],
      [RED(3), RED(6)],
    ]);
    expect(play(three, 'p0', { type: 'play', card: RED_SKIP }).turn).toBe(2);
    const rev = setup([
      [RED_REVERSE, RED(1)],
      [RED(2), RED(4)],
      [RED(3), RED(6)],
    ]);
    const after = play(rev, 'p0', { type: 'play', card: RED_REVERSE });
    expect(after.direction).toBe(-1);
    expect(after.turn).toBe(2); // counter clockwise from seat 0
    const two = setup([
      [RED_REVERSE, RED(1)],
      [RED(2), RED(4)],
    ]);
    expect(play(two, 'p0', { type: 'play', card: RED_REVERSE }).turn).toBe(0);
  });

  it('draw two and wild four make the next player draw and lose the turn', () => {
    const s = setup([
      [RED_DRAW2, RED(1)],
      [RED(2), RED(4)],
      [RED(3), RED(6)],
    ]);
    const a = play(s, 'p0', { type: 'play', card: RED_DRAW2 });
    expect(a.players[1]!.hand).toHaveLength(4);
    expect(a.turn).toBe(2);
    const w = setup([
      [WILD4, YELLOW(1)],
      [RED(2), RED(4)],
      [RED(3), RED(6)],
    ]);
    const b = play(w, 'p0', { type: 'play', card: WILD4, color: 1 });
    expect(b.players[1]!.hand).toHaveLength(6);
    expect(b.turn).toBe(2);
    expect(b.color).toBe(1);
  });

  it('drawing: an unplayable card ends the turn, a playable one may be played or passed', () => {
    const s = setup([[YELLOW(9)], [RED(1), RED(2)]], { stock: [YELLOW(1), RED(8)] });
    const unplayable = play(s, 'p0', { type: 'draw' }); // draws RED(8)? the top is the last element
    // The last card of the stock is drawn first: RED(8) matches, so the turn stays.
    expect(unplayable.drawn).toBe(RED(8));
    expect(unplayable.turn).toBe(0);
    expect(game.validateMove(unplayable, 'p0', { type: 'draw' }).ok).toBe(false);
    expect(game.validateMove(unplayable, 'p0', { type: 'play', card: YELLOW(9) }).ok).toBe(false);
    expect(play(unplayable, 'p0', { type: 'pass' }).turn).toBe(1);
    const s2 = setup([[YELLOW(9)], [RED(1), RED(2)]], { stock: [RED(8), YELLOW(1)] });
    const ended = play(s2, 'p0', { type: 'draw' });
    expect(ended.drawn).toBeNull(); // YELLOW(1) does not match
    expect(ended.turn).toBe(1);
  });

  it('reshuffles the discard pile when the deck runs out', () => {
    const s = setup([[YELLOW(9)], [RED(1)]], { stock: [], pile: [YELLOW(1), YELLOW(2), RED(5)] });
    const after = play(s, 'p0', { type: 'draw' });
    expect(after.players[0]!.hand).toHaveLength(2);
    expect(after.pile).toEqual([RED(5)]);
  });
});

describe('finishing', () => {
  it('the last card ends the game', () => {
    const s = setup([[RED(7)], [RED(1), RED(2)]]);
    const done = play(s, 'p0', { type: 'play', card: RED(7) });
    expect(done.winner).toBe('p0');
    expect(game.isGameOver(done)).toBe(true);
    const results = game.getResults(done);
    expect(results.rankings[0]).toMatchObject({ playerId: 'p0', rank: 1 });
    expect(results.rankings).toHaveLength(2);
  });

  it('you cannot end with a special card', () => {
    for (const card of [RED_SKIP, RED_REVERSE, RED_DRAW2, WILD, WILD4]) {
      const s = setup([[card], [YELLOW(1), YELLOW(2)]]);
      const check = game.validateMove(s, 'p0', { type: 'play', card, color: 0 });
      // (Wild Draw Four is also refused for another reason when red is held; here nothing red.)
      expect(check.ok).toBe(false);
    }
    // With a second card the same special card is fine.
    const ok = setup([
      [RED_SKIP, YELLOW(1)],
      [RED(2), RED(3)],
    ]);
    expect(game.validateMove(ok, 'p0', { type: 'play', card: RED_SKIP }).ok).toBe(true);
  });

  it('ranks the others by what they hold', () => {
    const s = setup([[RED(7)], [RED(1), RED(4)], [WILD, RED(6)], [RED(2), RED(3), RED(8)]]);
    const done = play(s, 'p0', { type: 'play', card: RED(7) });
    const r = game.getResults(done).rankings;
    expect(r.map((x) => x.playerId)).toEqual(['p0', 'p1', 'p3', 'p2']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('UNO!', () => {
  it('can only be called with one card left, and it counts until the hand changes', () => {
    const s = setup([
      [RED(7), RED(8)],
      [RED(1), RED(2)],
    ]);
    expect(game.validateMove(s, 'p0', { type: 'uno' }).ok).toBe(false);
    const one = play(s, 'p0', { type: 'play', card: RED(7) }); // p0 now holds one card, no UNO!
    expect(game.getPlayerView(one, 'p0').mustCall).toBe(true);
    const called = play(one, 'p0', { type: 'uno' }); // out of turn is fine
    expect(called.players[0]!.called).toBe(true);
    expect(called.unoCall).toMatchObject({ playerId: 'p0' });
    expect(called.turn).toBe(1); // calling does not change the turn
    expect(game.getPlayerView(called, 'p0').mustCall).toBe(false);
    expect(game.validateMove(called, 'p0', { type: 'uno' }).ok).toBe(false);
  });

  it('playing the second to last card together with UNO! counts as calling', () => {
    const s = setup([
      [RED(7), RED(8)],
      [RED(1), RED(2)],
    ]);
    const one = play(s, 'p0', { type: 'play', card: RED(7), uno: true });
    expect(one.players[0]!.called).toBe(true);
    // The next player throws a card: no penalty.
    const next = play(one, 'p1', { type: 'play', card: RED(1) });
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.lastEvent?.penalty).toBeNull();
  });

  it('the penalty: another player throws a card before UNO! was pressed: a card is drawn automatically', () => {
    const s = setup([
      [RED(7), RED(8)],
      [RED(1), RED(2)],
    ]);
    const one = play(s, 'p0', { type: 'play', card: RED(7) });
    const next = play(one, 'p1', { type: 'play', card: RED(1) });
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(next.lastEvent?.penalty).toBe('p0');
    // So p0 cannot go out with the next card any more.
    const tryOut = play(next, 'p0', { type: 'play', card: RED(8) });
    expect(tryOut.winner).toBeNull();
  });

  it('pressing in time avoids the penalty; drawing is not throwing', () => {
    const s = setup(
      [
        [RED(7), RED(8)],
        [RED(1), YELLOW(2)],
      ],
      { stock: [YELLOW(3), YELLOW(4)] },
    );
    const one = play(s, 'p0', { type: 'play', card: RED(7) });
    const drew = play(one, 'p1', { type: 'draw' });
    expect(drew.players[0]!.hand).toHaveLength(1);
    const pressed = play(one, 'p0', { type: 'uno' });
    const thrown = play(pressed, 'p1', { type: 'play', card: RED(1) });
    expect(thrown.players[0]!.hand).toHaveLength(1);
    expect(thrown.lastEvent?.penalty).toBeNull();
  });

  it('is a free move (it must not restart the turn clock)', () => {
    expect(game.isFreeMove?.({ type: 'uno' })).toBe(true);
    expect(game.isFreeMove?.({ type: 'draw' })).toBe(false);
  });
});

describe('views', () => {
  it('shows my cards and only the others’ counts', () => {
    const s = game.createInitialState(players(3), {}, createSeededRng(3));
    const v = game.getPlayerView(s, 'p1');
    expect(v.hand).toEqual(s.players[1]!.hand);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.players[0]!.hand));
    expect(v.players.map((p) => p.count)).toEqual([7, 7, 7]);
  });
});

describe('computer play', () => {
  it('auto-played games always finish, the rules hold and cards are conserved', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = createSeededRng(seed);
      const n = 2 + (seed % 5);
      let s = game.createInitialState(players(n), {}, r);
      let moves = 0;
      while (!game.isGameOver(s)) {
        const id = game.getCurrentPlayers(s)[0]!;
        const auto = game.autoMove!(s, id, r);
        expect(game.validateMove(s, id, auto.move).ok).toBe(true);
        s = game.applyMove(s, id, auto.move, r);
        const total =
          s.stock.length + s.pile.length + s.players.reduce((a, p) => a + p.hand.length, 0);
        expect(total).toBe(DECK_SIZE);
        if (++moves > 5000) throw new Error(`game ${seed} did not finish`);
      }
      expect(game.getResults(s).rankings).toHaveLength(n);
    }
  });
});
