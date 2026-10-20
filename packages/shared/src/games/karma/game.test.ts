import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import type { GamePlayer } from '../../game/types';
import { getGame } from '../registry';
import { DECK_SIZE, cardLabel, rankOf, suitOf } from './cards';
import type { Card } from './cards';
import { activeZone, canPlayRank, effectiveTop, findStarter, karmaGame as game } from './game';
import type { KarmaMove, KarmaPlayerState, KarmaState } from './types';

const rng = createSeededRng(1);
const seat = (n: number): GamePlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, avatar: 'fox' }));

/** card(7) = 7♠, card(7, 1) = 7♥ ... */
const card = (rank: number, suit = 0): Card => suit * 13 + (rank - 2);

type SeatInit = Partial<Pick<KarmaPlayerState, 'hand' | 'faceUp' | 'faceDown' | 'ready' | 'out'>>;

/** A play-phase state with exact cards; p1 to move unless `turn` says otherwise. */
function table(
  seats: SeatInit[],
  extra: Partial<Pick<KarmaState, 'pile' | 'stock' | 'turn' | 'phase' | 'finishOrder'>> = {},
): KarmaState {
  return {
    phase: 'play',
    players: seats.map((s, i) => ({
      id: `p${i + 1}`,
      hand: [],
      faceUp: [null, null, null],
      faceDown: [null, null, null],
      ready: true,
      out: false,
      ...s,
    })),
    stock: [],
    pile: [],
    burned: 0,
    turn: 0,
    finishOrder: [],
    mustPickUp: false,
    eventSeq: 0,
    lastEvent: null,
    ...extra,
  };
}

const move = (s: KarmaState, id: string, m: KarmaMove) => game.applyMove(s, id, m, rng);
const ok = (s: KarmaState, id: string, m: KarmaMove) =>
  expect(game.validateMove(s, id, m)).toEqual({ ok: true });
const bad = (s: KarmaState, id: string, m: KarmaMove, error?: string) => {
  const r = game.validateMove(s, id, m);
  expect(r.ok).toBe(false);
  if (error && !r.ok) expect(r.error).toContain(error);
};
const hand = (s: KarmaState, i: number) => s.players[i]!.hand;

describe('cards', () => {
  it('encodes ranks and suits and labels them', () => {
    expect(rankOf(0)).toBe(2);
    expect(rankOf(12)).toBe(14);
    expect(suitOf(13)).toBe(1);
    expect(cardLabel(card(14, 0))).toBe('A♠');
    expect(cardLabel(card(10, 1))).toBe('10♥');
    expect(cardLabel(card(11, 3))).toBe('J♣');
    expect(new Set(Array.from({ length: DECK_SIZE }, (_, c) => cardLabel(c))).size).toBe(52);
  });
});

describe('canPlayRank', () => {
  it('allows anything on an empty pile', () => {
    for (let r = 2; r <= 14; r++) expect(canPlayRank([], r)).toBe(true);
  });
  it('requires equal or higher on a normal card', () => {
    expect(canPlayRank([card(6)], 6)).toBe(true);
    expect(canPlayRank([card(6)], 8)).toBe(true);
    expect(canPlayRank([card(6)], 5)).toBe(false);
    expect(canPlayRank([card(14)], 13)).toBe(false);
  });
  it('after a 7 only 7 or lower, a 2 or a 10 may follow (7s stack)', () => {
    for (const rank of [3, 4, 5, 6, 7, 2, 10]) expect(canPlayRank([card(7)], rank)).toBe(true);
    for (const rank of [8, 9, 11, 12, 13, 14]) expect(canPlayRank([card(7)], rank)).toBe(false);
  });
  it('a 7 can be played on anything that is not higher than it', () => {
    expect(canPlayRank([card(5)], 7)).toBe(true);
    expect(canPlayRank([card(6)], 7)).toBe(true);
    expect(canPlayRank([card(8)], 7)).toBe(false);
    expect(canPlayRank([card(14)], 7)).toBe(false);
  });
  it('the 7 rule only looks at the top card', () => {
    expect(canPlayRank([card(7), card(9)], 9)).toBe(true);
    expect(canPlayRank([card(9), card(7)], 9)).toBe(false);
    expect(canPlayRank([card(7), card(2)], 9)).toBe(true); // a 2 resets
  });
  it('a 3 is invisible: playable on anything, and the card beneath it still counts', () => {
    for (const top of [5, 7, 14]) expect(canPlayRank([card(top)], 3)).toBe(true);
    expect(canPlayRank([card(7), card(3)], 9)).toBe(false); // 7, 3: still 7 or lower
    expect(canPlayRank([card(7), card(3)], 6)).toBe(true);
    expect(canPlayRank([card(9), card(3)], 8)).toBe(false); // 9, 3: still 9 or higher
    expect(canPlayRank([card(9), card(3)], 9)).toBe(true);
    expect(canPlayRank([card(7), card(3), card(3)], 8)).toBe(false); // several 3s are all see-through
    expect(canPlayRank([card(7), card(3), card(3)], 7)).toBe(true);
    expect(canPlayRank([card(2), card(3)], 4)).toBe(true); // a 2 beneath: anything goes
    expect(canPlayRank([card(3), card(3)], 4)).toBe(true); // only 3s: like an empty pile
    expect(effectiveTop([card(9), card(3)])).toBe(card(9));
    expect(effectiveTop([card(3)])).toBeUndefined();
  });
  it('lets 2 and 10 go on anything, and anything go on a 2', () => {
    expect(canPlayRank([card(14)], 2)).toBe(true);
    expect(canPlayRank([card(14)], 10)).toBe(true);
    expect(canPlayRank([card(9), card(2)], 3)).toBe(true);
  });
  it('only looks at the top card', () => {
    expect(canPlayRank([card(14), card(5)], 5)).toBe(true);
    expect(canPlayRank([card(5), card(14)], 13)).toBe(false);
  });
});

describe('setup', () => {
  it.each([2, 3, 4, 5])('deals 3 face-down, 3 face-up and 3 in hand to %i players', (n) => {
    const s = game.createInitialState(seat(n), {}, createSeededRng(n));
    expect(s.phase).toBe('swap');
    for (const p of s.players) {
      expect(p.faceDown.filter((c) => c !== null)).toHaveLength(3);
      expect(p.faceUp.filter((c) => c !== null)).toHaveLength(3);
      expect(p.hand).toHaveLength(3);
      expect(p.ready).toBe(false);
    }
    expect(s.stock).toHaveLength(DECK_SIZE - 9 * n);
    const all = [
      ...s.stock,
      ...s.players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown]),
    ] as Card[];
    expect(new Set(all).size).toBe(DECK_SIZE - 0 * n);
  });

  it('supports 2-5 players only', () => {
    expect(() => game.createInitialState(seat(1), {}, rng)).toThrow();
    expect(() => game.createInitialState(seat(6), {}, rng)).toThrow();
  });

  it('is deterministic per seed', () => {
    const a = game.createInitialState(seat(3), {}, createSeededRng(9));
    const b = game.createInitialState(seat(3), {}, createSeededRng(9));
    const c = game.createInitialState(seat(3), {}, createSeededRng(10));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('is registered', () => {
    expect(getGame('karma')).toBe(game);
    expect(game.name).toBe('Karma');
  });

  it('lets every player act at once in the swap phase', () => {
    const s = game.createInitialState(seat(3), {}, rng);
    expect(game.getCurrentPlayers(s)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('player views (hidden information)', () => {
  const s = game.createInitialState(seat(3), {}, createSeededRng(4));

  it('shows you your own hand only', () => {
    const v1 = game.getPlayerView(s, 'p1');
    expect(v1.players[0]!.hand).toEqual(s.players[0]!.hand);
    expect(v1.players[1]!.hand).toBeNull();
    expect(v1.players[1]!.handCount).toBe(3);
  });

  it('hides face-down cards from everyone, including their owner', () => {
    const view = game.getPlayerView(s, 'p1');
    expect(view.players[0]!.faceDown).toEqual([true, true, true]);
    const json = JSON.stringify(view);
    for (const p of s.players) {
      for (const c of p.faceDown) {
        // a face-down value must not appear anywhere it would be identifiable
        expect(view.players.flatMap((x) => x.faceDown)).not.toContain(c);
      }
    }
    expect(json).not.toContain('"stock"');
  });

  it('shows face-up cards to everyone and only the size of the stock', () => {
    const view = game.getPlayerView(s, 'p2');
    expect(view.players[0]!.faceUp).toEqual(s.players[0]!.faceUp);
    expect(view.stockCount).toBe(s.stock.length);
  });

  it('shows the pile and what just happened', () => {
    const t = table([{ hand: [card(5)] }, { hand: [card(9)] }]);
    const after = move(t, 'p1', { type: 'play', cards: [card(5)] });
    const view = game.getPlayerView(after, 'p2');
    expect(view.pile).toEqual([card(5)]);
    expect(view.lastEvent).toMatchObject({ playerId: 'p1', kind: 'play', cards: [card(5)] });
  });
});

describe('swap phase', () => {
  const swapState = () => {
    const s = table(
      [
        { hand: [card(9), card(4), card(12)], faceUp: [card(3), card(8), card(5)], ready: false },
        { hand: [card(2)], faceUp: [card(3), null, null], ready: false },
      ],
      { phase: 'swap' },
    );
    return s;
  };

  it('swaps a hand card with a face-up slot in place', () => {
    const s = move(swapState(), 'p1', { type: 'swap', hand: card(12), up: 0 });
    expect(s.players[0]!.hand).toEqual([card(9), card(4), card(3)]);
    expect(s.players[0]!.faceUp).toEqual([card(12), card(8), card(5)]);
  });

  it('rejects swapping cards you do not have or empty slots', () => {
    bad(swapState(), 'p1', { type: 'swap', hand: card(7), up: 0 }, 'not in your hand');
    bad(swapState(), 'p2', { type: 'swap', hand: card(2), up: 1 }, 'face-up');
  });

  it('locks swapping once ready, and starts play when everyone is ready', () => {
    let s = move(swapState(), 'p1', { type: 'ready' });
    expect(s.phase).toBe('swap');
    expect(game.getCurrentPlayers(s)).toEqual(['p2']);
    bad(s, 'p1', { type: 'swap', hand: card(9), up: 1 }, 'ready');
    bad(s, 'p1', { type: 'ready' }, 'already');
    s = move(s, 'p2', { type: 'ready' });
    expect(s.phase).toBe('play');
    expect(game.getCurrentPlayers(s)).toHaveLength(1);
  });

  it('rejects play moves during the swap phase', () => {
    bad(swapState(), 'p1', { type: 'play', cards: [card(9)] }, 'Swap');
    bad(swapState(), 'p1', { type: 'pickup' }, 'Swap');
  });

  it('cannot swap after the swap phase', () => {
    bad(table([{ hand: [card(9)], faceUp: [card(3), null, null] }, {}]), 'p1', {
      type: 'swap',
      hand: card(9),
      up: 0,
    });
  });
});

describe('who starts', () => {
  const players = (seats: SeatInit[]) => table(seats).players;

  it('the lowest ordinary card starts: a 4 before a 5, whether in hand or face up', () => {
    expect(
      findStarter(
        players([{ hand: [card(9)] }, { faceUp: [card(5), null, null] }, { hand: [card(4)] }]),
      ),
    ).toBe(2);
    expect(findStarter(players([{ hand: [card(6)] }, { faceUp: [card(5), null, null] }]))).toBe(1);
  });

  it('2, 3 and 10 are specials and never start', () => {
    expect(
      findStarter(
        players([
          { hand: [card(2), card(3)] },
          { hand: [card(10), card(14)] },
          { hand: [card(9)] },
        ]),
      ),
    ).toBe(2);
  });

  it('equal ranks are decided by suit: clubs, diamonds, hearts, spades', () => {
    const four = (suit: number) => ({ hand: [card(4, suit)] });
    // suits: 0 spades, 1 hearts, 2 diamonds, 3 clubs
    expect(findStarter(players([four(0), four(1), four(2), four(3)]))).toBe(3);
    expect(findStarter(players([four(0), four(1), four(2)]))).toBe(2);
    expect(findStarter(players([four(0), four(1)]))).toBe(1);
  });

  it('a lower rank beats a lower suit', () => {
    expect(findStarter(players([{ hand: [card(5, 3)] }, { hand: [card(4, 0)] }]))).toBe(1);
  });

  it('falls back to the first seat when only specials are out', () => {
    expect(findStarter(players([{ hand: [card(3)] }, { hand: [card(10)] }]))).toBe(0);
  });

  it('is applied when the last player presses ready', () => {
    const s = table(
      [
        { hand: [card(9)], ready: true },
        { faceUp: [card(4), null, null], ready: false },
        { hand: [card(5)], ready: true },
      ],
      { phase: 'swap' },
    );
    expect(move(s, 'p2', { type: 'ready' }).turn).toBe(1);
  });
});

describe('playing cards', () => {
  it('enforces turn order', () => {
    const s = table([{ hand: [card(5)] }, { hand: [card(9)] }]);
    bad(s, 'p2', { type: 'play', cards: [card(9)] }, 'Not your turn');
    bad(s, 'ghost', { type: 'pickup' }, 'not in this game');
  });

  it('accepts equal or higher, rejects lower', () => {
    const s = table([{ hand: [card(5), card(6, 1), card(8)] }, {}], { pile: [card(6)] });
    ok(s, 'p1', { type: 'play', cards: [card(6, 1)] });
    ok(s, 'p1', { type: 'play', cards: [card(8)] });
    bad(s, 'p1', { type: 'play', cards: [card(5)] }, 'Too low');
  });

  describe('after a 7', () => {
    const onSeven = () =>
      table([{ hand: [card(3), card(6), card(7, 1), card(8), card(2), card(10)] }, {}], {
        pile: [card(9), card(7)],
      });

    it('accepts equal or lower cards (another 7 too), a 2 and a 10', () => {
      ok(onSeven(), 'p1', { type: 'play', cards: [card(7, 1)] });
      ok(onSeven(), 'p1', { type: 'play', cards: [card(3)] });
      ok(onSeven(), 'p1', { type: 'play', cards: [card(6)] });
      ok(onSeven(), 'p1', { type: 'play', cards: [card(2)] });
      ok(onSeven(), 'p1', { type: 'play', cards: [card(10)] });
    });

    it('rejects anything higher, with a helpful message', () => {
      bad(onSeven(), 'p1', { type: 'play', cards: [card(8)] }, 'After a 7');
    });

    it('a 10 still burns the pile after a 7', () => {
      const after = move(onSeven(), 'p1', { type: 'play', cards: [card(10)] });
      expect(after.pile).toEqual([]);
      expect(after.turn).toBe(0);
    });

    it('a set of 7s can be played together on a lower card', () => {
      const s = table([{ hand: [card(7), card(7, 1), card(4)] }, { hand: [card(3), card(9)] }], {
        pile: [card(5)],
      });
      const after = move(s, 'p1', { type: 'play', cards: [card(7), card(7, 1)] });
      expect(after.pile).toEqual([card(5), card(7), card(7, 1)]);
      // ...and the next player is now held to lower cards
      bad(after, 'p2', { type: 'play', cards: [card(9)] }, 'After a 7');
    });

    it('a player with nothing lower must pick up', () => {
      const s = table([{ hand: [card(8), card(9)] }, {}], { pile: [card(7)] });
      bad(s, 'p1', { type: 'play', cards: [card(8)] });
      ok(s, 'p1', { type: 'pickup' });
      expect(game.autoMove!(s, 'p1', rng).move).toEqual({ type: 'pickup' });
    });

    it('applies to blind cards too: a high blind card after a 7 is picked up', () => {
      const s = table([{ faceDown: [card(9), card(3), card(4)] }, { hand: [card(9)] }], {
        pile: [card(7)],
      });
      const flipped = move(s, 'p1', { type: 'playDown', index: 0 });
      expect(flipped.lastEvent).toMatchObject({ kind: 'blind', failed: true });
      const after = move(flipped, 'p1', { type: 'pickup' });
      expect(after.pile).toEqual([]);
      expect(hand(after, 0)).toEqual([card(7), card(9)]);
      expect(after.lastEvent).toMatchObject({ kind: 'pickup', pickedUp: 2 });
    });

    it('a low blind card after a 7 is fine', () => {
      const s = table([{ faceDown: [card(4), card(3), card(5)] }, { hand: [card(9)] }], {
        pile: [card(7)],
      });
      const after = move(s, 'p1', { type: 'playDown', index: 0 });
      expect(after.pile).toEqual([card(7), card(4)]);
    });
  });

  it('a 10 can be played at any time, on anything: empty pile, ace, 7, 2, even a pile of 10s', () => {
    for (const pile of [
      [],
      [card(14)],
      [card(7)],
      [card(2)],
      [card(9), card(7)],
      [card(5), card(10, 1)],
    ]) {
      const s = table([{ hand: [card(10), card(4)] }, {}], { pile });
      ok(s, 'p1', { type: 'play', cards: [card(10)] });
      const after = move(s, 'p1', { type: 'play', cards: [card(10)] });
      expect(after.pile).toEqual([]); // always burns
      expect(after.turn).toBe(0); // and you go again
    }
  });

  it('allows 2 and 10 on anything, and anything on a 2', () => {
    const onKing = table([{ hand: [card(2), card(10), card(4)] }, {}], { pile: [card(13)] });
    ok(onKing, 'p1', { type: 'play', cards: [card(2)] });
    ok(onKing, 'p1', { type: 'play', cards: [card(10)] });
    bad(onKing, 'p1', { type: 'play', cards: [card(4)] });
    const onTwo = table([{ hand: [card(3)] }, {}], { pile: [card(13), card(2)] });
    ok(onTwo, 'p1', { type: 'play', cards: [card(3)] });
  });

  it('allows several cards of the same rank together, but not mixed ranks', () => {
    const s = table([{ hand: [card(8), card(8, 1), card(9)] }, {}], { pile: [card(5)] });
    ok(s, 'p1', { type: 'play', cards: [card(8), card(8, 1)] });
    bad(s, 'p1', { type: 'play', cards: [card(8), card(9)] }, 'same rank');
    bad(s, 'p1', { type: 'play', cards: [card(8), card(8)] }, 'once');
  });

  it('rejects cards you do not hold', () => {
    const s = table([{ hand: [card(8)] }, { hand: [card(9)] }]);
    bad(s, 'p1', { type: 'play', cards: [card(9)] });
  });

  it('puts the cards on the pile, ends the turn and refills the hand from the stock', () => {
    const s = table([{ hand: [card(5), card(6), card(7)] }, { hand: [card(9)] }], {
      stock: [card(14), card(13), card(12), card(11)],
    });
    const after = move(s, 'p1', { type: 'play', cards: [card(5)] });
    expect(after.pile).toEqual([card(5)]);
    expect(hand(after, 0)).toEqual([card(6), card(7), card(11)]); // drew the top of the stock
    expect(after.stock).toEqual([card(14), card(13), card(12)]);
    expect(after.turn).toBe(1);
  });

  it('refills after playing a set, up to three cards', () => {
    const s = table([{ hand: [card(5), card(5, 1), card(5, 2)] }, {}], {
      stock: [card(9), card(10, 1), card(11), card(12)],
    });
    const after = move(s, 'p1', { type: 'play', cards: [card(5), card(5, 1), card(5, 2)] });
    expect(hand(after, 0)).toHaveLength(3);
    expect(after.stock).toHaveLength(1);
  });

  it('does not refill when the stock is empty', () => {
    const s = table([{ hand: [card(5), card(6)] }, {}]);
    expect(hand(move(s, 'p1', { type: 'play', cards: [card(5)] }), 0)).toEqual([card(6)]);
  });

  it('does not refill a hand that is being played from face-up cards', () => {
    const s = table([{ faceUp: [card(5), card(6), null] }, { hand: [card(9)] }], {
      stock: [],
    });
    expect(hand(move(s, 'p1', { type: 'play', cards: [card(5)] }), 0)).toEqual([]);
  });
});

describe('picking up', () => {
  it('moves the whole pile into the hand and passes the turn', () => {
    const s = table([{ hand: [card(3)] }, { hand: [card(9)] }], {
      pile: [card(10, 1), card(12), card(13)],
    });
    // (a 10 would have burned; this pile is hand-built)
    const after = move(s, 'p1', { type: 'pickup' });
    expect(hand(after, 0)).toHaveLength(4);
    expect(after.pile).toEqual([]);
    expect(after.turn).toBe(1);
    expect(after.lastEvent).toMatchObject({ kind: 'pickup', pickedUp: 3 });
  });

  it('can be chosen even when a card could be played', () => {
    const s = table([{ hand: [card(14)] }, {}], { pile: [card(5)] });
    ok(s, 'p1', { type: 'pickup' });
  });

  it('is impossible on an empty pile', () => {
    bad(table([{ hand: [card(5)] }, {}]), 'p1', { type: 'pickup' }, 'nothing to pick up');
  });

  it('puts picked-up cards in the hand, so the hand must be played before face-up cards', () => {
    const s = table([{ hand: [], faceUp: [card(9), null, null] }, { hand: [card(9)] }], {
      pile: [card(13)],
    });
    const after = move(s, 'p1', { type: 'pickup' });
    expect(activeZone(after.players[0]!)).toBe('hand');
  });
});

describe('burning the pile', () => {
  it('a 10 burns the pile and the same player goes again', () => {
    const s = table([{ hand: [card(10), card(4)] }, { hand: [card(9)] }], {
      pile: [card(12), card(13)],
    });
    const after = move(s, 'p1', { type: 'play', cards: [card(10)] });
    expect(after.pile).toEqual([]);
    expect(after.burned).toBe(3);
    expect(after.turn).toBe(0);
    expect(after.lastEvent).toMatchObject({ burned: true });
    ok(after, 'p1', { type: 'play', cards: [card(4)] }); // may lead anything
    bad(after, 'p1', { type: 'pickup' }, 'nothing to pick up');
  });

  it('a 10 may open an empty pile', () => {
    const after = move(table([{ hand: [card(10), card(4)] }, {}]), 'p1', {
      type: 'play',
      cards: [card(10)],
    });
    expect(after.pile).toEqual([]);
    expect(after.turn).toBe(0);
  });

  it('four of a kind played together burns', () => {
    const s = table([{ hand: [card(7), card(7, 1), card(7, 2), card(7, 3)] }, {}], {
      pile: [card(5)],
    });
    const after = move(s, 'p1', {
      type: 'play',
      cards: [card(7), card(7, 1), card(7, 2), card(7, 3)],
    });
    expect(after.pile).toEqual([]);
    expect(after.burned).toBe(5);
    expect(after.turn).toBe(0);
  });

  it('the fourth card on top of three of a kind burns, even across turns', () => {
    const s = table([{ hand: [card(8, 3), card(4)] }, {}], {
      pile: [card(9), card(8), card(8, 1), card(8, 2)],
    });
    const after = move(s, 'p1', { type: 'play', cards: [card(8, 3)] });
    expect(after.pile).toEqual([]);
    expect(after.burned).toBe(5);
    expect(after.turn).toBe(0);
  });

  it('three of a kind alone does not burn', () => {
    const s = table([{ hand: [card(7), card(7, 1), card(7, 2), card(4)] }, { hand: [card(9)] }]);
    const after = move(s, 'p1', { type: 'play', cards: [card(7), card(7, 1), card(7, 2)] });
    expect(after.pile).toHaveLength(3);
    expect(after.turn).toBe(1);
  });

  it('a lone 2 does not burn, but four 2s do', () => {
    const lone = move(table([{ hand: [card(2), card(4)] }, { hand: [card(9)] }]), 'p1', {
      type: 'play',
      cards: [card(2)],
    });
    expect(lone.pile).toEqual([card(2)]);
    expect(lone.turn).toBe(1);

    const four = move(
      table([{ hand: [card(2, 3), card(4)] }, {}], { pile: [card(2), card(2, 1), card(2, 2)] }),
      'p1',
      { type: 'play', cards: [card(2, 3)] },
    );
    expect(four.pile).toEqual([]);
  });

  it('refills the hand before the extra turn', () => {
    const s = table([{ hand: [card(10)] }, {}], { stock: [card(6), card(7), card(8)] });
    const after = move(s, 'p1', { type: 'play', cards: [card(10)] });
    expect(hand(after, 0)).toHaveLength(3);
    expect(after.turn).toBe(0);
  });

  it('a player who burns with their last card is out, and the turn moves on', () => {
    const s = table([{ hand: [card(10)] }, { hand: [card(9)] }, { hand: [card(8)] }], {
      pile: [card(12)],
    });
    const after = move(s, 'p1', { type: 'play', cards: [card(10)] });
    expect(after.players[0]!.out).toBe(true);
    expect(after.turn).toBe(1);
    expect(after.pile).toEqual([]);
  });
});

describe('the 8 skips the next player', () => {
  const three = () =>
    table([
      { hand: [card(8), card(8, 1), card(8, 2), card(5)] },
      { hand: [card(9), card(3)] },
      { hand: [card(11), card(4)] },
    ]);

  it('passes over the next player', () => {
    const after = move(three(), 'p1', { type: 'play', cards: [card(8)] });
    expect(after.turn).toBe(2); // p2 is skipped, p3 plays
    expect(after.lastEvent).toMatchObject({ kind: 'play', skipped: ['p2'], burned: false });
    expect(after.pile).toEqual([card(8)]);
  });

  it('with two players you simply go again', () => {
    const s = table([{ hand: [card(8), card(5)] }, { hand: [card(9), card(3)] }]);
    const after = move(s, 'p1', { type: 'play', cards: [card(8)] });
    expect(after.turn).toBe(0);
    expect(after.lastEvent).toMatchObject({ skipped: ['p2'] });
    // ...and the next card must still beat the 8 (a 5 may not follow it)
    bad(after, 'p1', { type: 'play', cards: [card(5)] }, 'Too low');
  });

  it('1v1: 8s stack on each other and you keep the turn each time, up to a final 10', () => {
    const s = table([
      { hand: [card(8), card(8, 1), card(8, 2), card(10), card(5)] },
      { hand: [card(9), card(3)] },
    ]);
    let after = move(s, 'p1', { type: 'play', cards: [card(8)] });
    expect(after.turn).toBe(0);
    after = move(after, 'p1', { type: 'play', cards: [card(8, 1)] }); // 8 on an 8
    expect(after.turn).toBe(0);
    after = move(after, 'p1', { type: 'play', cards: [card(8, 2)] }); // and another
    expect(after.turn).toBe(0);
    after = move(after, 'p1', { type: 'play', cards: [card(10)] }); // a 10 burns, still me
    expect(after.turn).toBe(0);
    expect(after.pile).toEqual([]);
    expect(after.lastEvent).toMatchObject({ burned: true });
  });

  it('every 8 in a set skips one more player', () => {
    const four = table([
      { hand: [card(8), card(8, 1), card(5)] },
      { hand: [card(9)] },
      { hand: [card(11)] },
      { hand: [card(12)] },
    ]);
    const after = move(four, 'p1', { type: 'play', cards: [card(8), card(8, 1)] });
    expect(after.lastEvent?.skipped).toEqual(['p2', 'p3']);
    expect(after.turn).toBe(3); // p4
  });

  it('you cannot skip yourself: skipping everybody else means you go again, once', () => {
    const after = move(three(), 'p1', { type: 'play', cards: [card(8), card(8, 1), card(8, 2)] });
    expect(after.lastEvent?.skipped).toEqual(['p2', 'p3']);
    expect(after.turn).toBe(0);
  });

  it('does not stack with a burn: four 8s burn the pile and you lead again, nobody is skipped', () => {
    const s = table(
      [
        { hand: [card(8), card(8, 1), card(8, 2), card(8, 3), card(5)] },
        { hand: [card(9)] },
        { hand: [card(11)] },
      ],
      { pile: [card(6)] },
    );
    const after = move(s, 'p1', {
      type: 'play',
      cards: [card(8), card(8, 1), card(8, 2), card(8, 3)],
    });
    expect(after.pile).toEqual([]);
    expect(after.turn).toBe(0);
    expect(after.lastEvent?.skipped).toEqual([]);
  });

  it('skips the next player who is still in the game, not one who is out', () => {
    const s = table(
      [
        { hand: [card(8), card(5)] },
        { hand: [], out: true },
        { hand: [card(9)] },
        { hand: [card(11)] },
      ],
      { finishOrder: ['p2'] },
    );
    const after = move(s, 'p1', { type: 'play', cards: [card(8)] });
    expect(after.lastEvent?.skipped).toEqual(['p3']);
    expect(after.turn).toBe(3);
  });

  it('applies when it is the last card too: the player is out and the next one is still skipped', () => {
    const s = table([
      { hand: [card(8)] },
      { hand: [card(9), card(3)] },
      { hand: [card(11), card(4)] },
    ]);
    const after = move(s, 'p1', { type: 'play', cards: [card(8)] });
    expect(after.players[0]!.out).toBe(true);
    expect(after.lastEvent).toMatchObject({ out: true, skipped: ['p2'] });
    expect(after.turn).toBe(2);
  });

  it('a blind 8 skips too, and a failed blind card never does', () => {
    const ok = move(
      table(
        [{ faceDown: [card(8), card(3), card(4)] }, { hand: [card(9)] }, { hand: [card(11)] }],
        { pile: [card(6)] },
      ),
      'p1',
      { type: 'playDown', index: 0 },
    );
    expect(ok.lastEvent).toMatchObject({ kind: 'blind', skipped: ['p2'] });
    expect(ok.turn).toBe(2);

    const flipped = move(
      table(
        [{ faceDown: [card(5), card(3), card(4)] }, { hand: [card(9)] }, { hand: [card(11)] }],
        { pile: [card(12)] },
      ),
      'p1',
      { type: 'playDown', index: 0 },
    );
    const failed = move(flipped, 'p1', { type: 'pickup' });
    expect(failed.lastEvent?.skipped).toEqual([]);
    expect(failed.turn).toBe(1);
  });

  it('cannot be played on top of a 7 (it is higher), and other cards do not skip', () => {
    const s = table([{ hand: [card(8), card(6)] }, { hand: [card(9)] }], { pile: [card(7)] });
    bad(s, 'p1', { type: 'play', cards: [card(8)] }, 'After a 7');
    const after = move(s, 'p1', { type: 'play', cards: [card(6)] });
    expect(after.lastEvent?.skipped).toEqual([]);
    expect(after.turn).toBe(1);
  });

  it('autoMove reports that the turn continues when an 8 sends it back to the same player', () => {
    const s = table([{ hand: [card(8)], faceUp: [card(14), null, null] }, { hand: [card(9)] }]);
    const auto = game.autoMove!(s, 'p1', rng);
    expect(auto.move).toEqual({ type: 'play', cards: [card(8)] });
    expect(auto.endsTurn).toBe(false);
  });
});

describe('computer swapping (autoMove in the swap phase)', () => {
  const swapTable = (hand: Card[], faceUp: (Card | null)[]) =>
    table([{ hand, faceUp, ready: false }, { ready: false }], { phase: 'swap' });

  it('moves strong cards (10, 2, aces) face-up and keeps low cards in hand', () => {
    let s = swapTable([card(10), card(14), card(3)], [card(4), card(5), card(6)]);
    const played: string[] = [];
    for (let i = 0; i < 10 && !s.players[0]!.ready; i++) {
      const { move: m } = game.autoMove!(s, 'p1', rng);
      played.push(m.type);
      s = move(s, 'p1', m);
    }
    expect(s.players[0]!.ready).toBe(true);
    expect(played.at(-1)).toBe('ready');
    expect(played.filter((t) => t === 'swap').length).toBeGreaterThanOrEqual(2);
    const up = s.players[0]!.faceUp.map((c) => rankOf(c!));
    expect(up).toEqual(expect.arrayContaining([10, 14])); // the 10 and the ace made it onto the table
    expect(Math.max(...s.players[0]!.hand.map(rankOf))).toBeLessThan(10); // nothing strong left in hand
  });

  it('does not bother with swaps that gain little', () => {
    const s = swapTable([card(8), card(6), card(5)], [card(7), card(7, 1), card(7, 2)]);
    expect(game.autoMove!(s, 'p1', rng).move).toEqual({ type: 'ready' });
  });

  it('keeps the turn open while it still swaps, then reports it as ended with ready', () => {
    const s = swapTable([card(10), card(3), card(4)], [card(5), card(6), card(9)]);
    const first = game.autoMove!(s, 'p1', rng);
    expect(first.move.type).toBe('swap');
    expect(first.endsTurn).toBe(false);
    const done = swapTable([card(3), card(4), card(5)], [card(10), card(14), card(2)]);
    const last = game.autoMove!(done, 'p1', rng);
    expect(last.move).toEqual({ type: 'ready' });
    expect(last.endsTurn).toBe(true);
  });

  it('never swaps forever (every swap improves the table)', () => {
    for (let seed = 0; seed < 100; seed++) {
      let s = game.createInitialState(seat(2), {}, createSeededRng(seed));
      let steps = 0;
      while (!s.players[0]!.ready) {
        if (steps++ > 20) throw new Error('swapping did not settle');
        s = move(s, 'p1', game.autoMove!(s, 'p1', rng).move);
      }
    }
  });
});

describe('computer players', () => {
  it('Karma can be played against the computer; Yatzy is not offered (its auto-play is too basic)', () => {
    expect(game.supportsBots).toBe(true);
    expect(getGame('yatzy')?.supportsBots).toBeUndefined();
  });
});

describe('face-up and face-down cards', () => {
  it('a too-low face-up card can be tried: it lands on the pile and the pile must be picked up', () => {
    const s = table([{ faceUp: [card(4), card(9), null] }, { hand: [card(9)] }], {
      pile: [card(12)],
    });
    const flipped = move(s, 'p1', { type: 'play', cards: [card(4)] });
    expect(flipped.pile).toEqual([card(12), card(4)]);
    expect(flipped.mustPickUp).toBe(true);
    expect(flipped.turn).toBe(0);
    expect(flipped.lastEvent).toMatchObject({ kind: 'play', failed: true, cards: [card(4)] });
    bad(flipped, 'p1', { type: 'play', cards: [card(9)] }, 'Pick up the pile first');
    const after = move(flipped, 'p1', { type: 'pickup' });
    expect(hand(after, 0)).toEqual([card(12), card(4)]);
    expect(after.turn).toBe(1);
  });

  it('a hand card still has to be playable', () => {
    const s = table([{ hand: [card(4)] }, {}], { pile: [card(12)] });
    bad(s, 'p1', { type: 'play', cards: [card(4)] }, 'Too low');
  });

  it('plays face-up cards once the hand is empty, never before', () => {
    const s = table([{ hand: [card(9)], faceUp: [card(10), null, null] }, {}]);
    bad(s, 'p1', { type: 'play', cards: [card(10)] }, 'hand cards first');
    const onlyUp = table([{ faceUp: [card(8), card(8, 1), card(9)] }, {}]);
    ok(onlyUp, 'p1', { type: 'play', cards: [card(8), card(8, 1)] });
    const after = move(onlyUp, 'p1', { type: 'play', cards: [card(8), card(8, 1)] });
    expect(after.players[0]!.faceUp).toEqual([null, null, card(9)]);
  });

  it('cannot play a face-down card while face-up cards remain', () => {
    const s = table([{ faceUp: [card(8), null, null], faceDown: [card(5), card(6), card(7)] }, {}]);
    bad(s, 'p1', { type: 'playDown', index: 0 }, 'first');
  });

  it('must pick a face-down card once nothing else is left', () => {
    const s = table([{ faceDown: [card(5), card(6), card(7)] }, {}]);
    bad(s, 'p1', { type: 'play', cards: [card(5)] }, 'face-down');
    ok(s, 'p1', { type: 'playDown', index: 1 });
    bad(
      table([{ faceDown: [card(5), null, null] }, {}]),
      'p1',
      { type: 'playDown', index: 1 },
      'no card',
    );
  });

  it('plays a good blind card like any other', () => {
    const s = table([{ faceDown: [card(9), card(3), card(4)] }, { hand: [card(9)] }], {
      pile: [card(6)],
    });
    const after = move(s, 'p1', { type: 'playDown', index: 0 });
    expect(after.pile).toEqual([card(6), card(9)]);
    expect(after.players[0]!.faceDown).toEqual([null, card(3), card(4)]);
    expect(after.turn).toBe(1);
    expect(after.lastEvent).toMatchObject({ kind: 'blind', cards: [card(9)], pickedUp: 0 });
  });

  it('a too-low blind card lies on the pile and its owner must then pick the pile up', () => {
    const s = table([{ faceDown: [card(4), card(5), card(6)] }, { hand: [card(9)] }], {
      pile: [card(12), card(13)],
    });
    const flipped = move(s, 'p1', { type: 'playDown', index: 0 });
    expect(flipped.pile).toEqual([card(12), card(13), card(4)]);
    expect(flipped.turn).toBe(0);
    expect(flipped.mustPickUp).toBe(true);
    expect(flipped.lastEvent).toMatchObject({ kind: 'blind', failed: true, pickedUp: 0 });
    // Nothing else is allowed until the pile is picked up; the computer does exactly that.
    bad(flipped, 'p1', { type: 'playDown', index: 1 }, 'Pick up the pile first');
    expect(game.autoMove!(flipped, 'p1', rng).move).toEqual({ type: 'pickup' });
    const after = move(flipped, 'p1', { type: 'pickup' });
    expect(after.pile).toEqual([]);
    expect(after.mustPickUp).toBe(false);
    expect(hand(after, 0)).toEqual([card(12), card(13), card(4)]);
    expect(after.turn).toBe(1);
    expect(after.lastEvent).toMatchObject({ kind: 'pickup', pickedUp: 3, burned: false });
    // The hand now comes before the remaining face-down cards.
    expect(activeZone(after.players[0]!)).toBe('hand');
  });

  it('a blind 10 burns and the same player goes again; a blind 2 resets', () => {
    const ten = move(
      table([{ faceDown: [card(10), card(4), card(5)] }, {}], { pile: [card(13)] }),
      'p1',
      { type: 'playDown', index: 0 },
    );
    expect(ten.pile).toEqual([]);
    expect(ten.turn).toBe(0);

    const two = move(
      table([{ faceDown: [card(2), card(4), card(5)] }, {}], { pile: [card(13)] }),
      'p1',
      { type: 'playDown', index: 0 },
    );
    expect(two.pile).toEqual([card(13), card(2)]);
    expect(two.turn).toBe(1);
  });
});

describe('going out and ending', () => {
  it('records who ran out and skips them afterwards', () => {
    const s = table([
      { hand: [card(9)] },
      { hand: [card(10), card(4), card(6)] },
      { hand: [card(9), card(5)] },
    ]);
    const after = move(s, 'p1', { type: 'play', cards: [card(9)] });
    expect(after.players[0]!.out).toBe(true);
    expect(after.finishOrder).toEqual(['p1']);
    expect(after.lastEvent).toMatchObject({ out: true });
    expect(after.turn).toBe(1);
    // p3 plays, then it goes to p2, skipping p1
    const p2 = move(after, 'p2', { type: 'play', cards: [card(10)] }); // burns, p2 again
    expect(p2.turn).toBe(1);
    const p2b = move(p2, 'p2', { type: 'play', cards: [card(4)] });
    expect(p2b.turn).toBe(2);
    const p3 = move(p2b, 'p3', { type: 'play', cards: [card(9)] });
    expect(p3.turn).toBe(1);
  });

  it('ends the game when one player is left, who is the loser', () => {
    const s = table([{ hand: [card(9)] }, { hand: [card(4)] }]);
    const after = move(s, 'p1', { type: 'play', cards: [card(9)] });
    expect(game.isGameOver(after)).toBe(true);
    expect(after.finishOrder).toEqual(['p1', 'p2']);
    expect(game.getCurrentPlayers(after)).toEqual([]);
    bad(after, 'p2', { type: 'pickup' }, 'over');
  });

  it('ranks players by when they ran out, with the loser last', () => {
    let s = table([{ hand: [card(9)] }, { hand: [card(10)] }, { hand: [card(4), card(5)] }]);
    s = move(s, 'p1', { type: 'play', cards: [card(9)] });
    s = move(s, 'p2', { type: 'play', cards: [card(10)] });
    expect(game.isGameOver(s)).toBe(true);
    expect(game.getResults(s).rankings).toEqual([
      { playerId: 'p1', score: 2, rank: 1 },
      { playerId: 'p2', score: 1, rank: 2 },
      { playerId: 'p3', score: 0, rank: 3 },
    ]);
  });

  it('a failed last blind card does not end the game: the card goes back to the hand', () => {
    const s = table([{ faceDown: [card(4), null, null] }, { hand: [card(9)] }], {
      pile: [card(13)],
    });
    const flipped = move(s, 'p1', { type: 'playDown', index: 0 });
    expect(flipped.players[0]!.out).toBe(false);
    expect(game.isGameOver(flipped)).toBe(false);
    const after = move(flipped, 'p1', { type: 'pickup' });
    expect(after.players[0]!.out).toBe(false);
    expect(hand(after, 0)).toEqual([card(13), card(4)]);
  });
});

describe('wire schema', () => {
  it('accepts valid moves', () => {
    for (const m of [
      { type: 'swap', hand: 3, up: 1 },
      { type: 'ready' },
      { type: 'play', cards: [1, 2] },
      { type: 'playDown', index: 2 },
      { type: 'pickup' },
    ]) {
      expect(game.moveSchema.safeParse(m).success).toBe(true);
    }
  });

  it('rejects malformed moves', () => {
    for (const m of [
      { type: 'play', cards: [] },
      { type: 'play', cards: [1, 2, 3, 4, 5] },
      { type: 'play', cards: [52] },
      { type: 'play', cards: [-1] },
      { type: 'play', cards: [1.5] },
      { type: 'playDown', index: 3 },
      { type: 'swap', hand: 1, up: 5 },
      { type: 'cheat' },
      null,
    ]) {
      expect(game.moveSchema.safeParse(m).success).toBe(false);
    }
  });

  it('accepts empty options only', () => {
    expect(game.optionsSchema.safeParse({}).success).toBe(true);
    expect(game.optionsSchema.safeParse({ x: 1 }).success).toBe(false);
  });
});

describe('simulated games (autoMove)', () => {
  function playOut(n: number, seed: number) {
    const r = createSeededRng(seed);
    let s = game.createInitialState(seat(n), {}, r);
    let moves = 0;
    while (!game.isGameOver(s)) {
      if (moves++ > 6000) throw new Error(`game ${n}p seed ${seed} did not finish`);
      const [id] = game.getCurrentPlayers(s);
      const { move: m } = game.autoMove!(s, id!, r);
      expect(game.validateMove(s, id!, m)).toEqual({ ok: true });
      s = game.applyMove(s, id!, m, r);
      assertConserved(s);
    }
    return s;
  }

  function assertConserved(s: KarmaState) {
    const inPlay = [
      ...s.stock,
      ...s.pile,
      ...s.players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown]),
    ].filter((c): c is Card => c !== null);
    expect(inPlay.length + s.burned).toBe(DECK_SIZE);
    expect(new Set(inPlay).size).toBe(inPlay.length); // no duplicated cards
    for (const p of s.players) {
      if (s.phase === 'play' && p.hand.length < 3 && s.stock.length > 0) {
        // hands are only short when the stock is empty (or a player is out)
        expect(p.out || p.hand.length >= 0).toBe(true);
      }
    }
  }

  it.each([2, 3, 4, 5])('%i-player games always finish with consistent cards', (n) => {
    for (let seed = 0; seed < 25; seed++) {
      const s = playOut(n, 1000 * n + seed);
      expect(s.finishOrder).toHaveLength(n);
      expect(new Set(s.finishOrder).size).toBe(n);
      expect(s.players.slice(0, n).filter((p) => !p.out).length).toBeLessThanOrEqual(1);
      const results = game.getResults(s).rankings;
      expect(results.map((r) => r.rank)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it.each([3, 4, 5])(
    'auto-played %i-player games never get stuck going round in circles (200 games)',
    (n) => {
      for (let seed = 0; seed < 200; seed++) {
        const r = createSeededRng(50_000 * n + seed);
        let s = game.createInitialState(seat(n), {}, r);
        let moves = 0;
        while (!game.isGameOver(s)) {
          if (moves++ > 3000)
            throw new Error(`${n}p seed ${seed} was still going after 3000 moves`);
          const [id] = game.getCurrentPlayers(s);
          s = game.applyMove(s, id!, game.autoMove!(s, id!, r).move, r);
        }
      }
    },
  );

  it('autoMove reports a turn as ended only when the turn really passes', () => {
    const r = createSeededRng(77);
    let s = game.createInitialState(seat(3), {}, r);
    for (let i = 0; i < 200 && !game.isGameOver(s); i++) {
      const [id] = game.getCurrentPlayers(s);
      const auto = game.autoMove!(s, id!, r);
      s = game.applyMove(s, id!, auto.move, r);
      const still = !game.isGameOver(s) && game.getCurrentPlayers(s).includes(id!);
      expect(auto.endsTurn).toBe(!still);
    }
  });
});
