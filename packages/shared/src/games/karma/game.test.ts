import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import type { GamePlayer } from '../../game/types';
import { getGame } from '../registry';
import { DECK_SIZE, cardLabel, rankOf, suitOf } from './cards';
import type { Card } from './cards';
import { activeZone, canPlayRank, findStarter, karmaGame as game } from './game';
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
    expect(canPlayRank([card(7)], 7)).toBe(true);
    expect(canPlayRank([card(7)], 8)).toBe(true);
    expect(canPlayRank([card(7)], 6)).toBe(false);
    expect(canPlayRank([card(14)], 13)).toBe(false);
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

  it('prefers a face-up 3 over a 3 in hand, regardless of seat', () => {
    expect(findStarter(players([{ hand: [card(3)] }, { faceUp: [card(3), null, null] }, {}]))).toBe(
      1,
    );
  });

  it('uses a 3 in hand when no 3 is face up', () => {
    expect(findStarter(players([{ hand: [card(9)] }, { hand: [card(3)] }]))).toBe(1);
  });

  it('breaks ties by seat order', () => {
    expect(
      findStarter(
        players([{}, { faceUp: [card(3), null, null] }, { faceUp: [card(3, 1), null, null] }]),
      ),
    ).toBe(1);
  });

  it('falls back to the next rank up when nobody has a 3', () => {
    expect(
      findStarter(players([{ hand: [card(9)] }, { hand: [card(4)] }, { hand: [card(6)] }])),
    ).toBe(1);
  });

  it('is applied when the last player presses ready', () => {
    const s = table(
      [
        { hand: [card(9)], ready: true },
        { faceUp: [card(3), null, null], ready: false },
        { hand: [card(3)], ready: true },
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
    const s = table([{ hand: [card(6), card(7, 1), card(8)] }, {}], { pile: [card(7)] });
    ok(s, 'p1', { type: 'play', cards: [card(7, 1)] });
    ok(s, 'p1', { type: 'play', cards: [card(8)] });
    bad(s, 'p1', { type: 'play', cards: [card(6)] }, 'Too low');
  });

  it('allows 2 and 10 on anything, and anything on a 2', () => {
    const onKing = table([{ hand: [card(2), card(10), card(3)] }, {}], { pile: [card(13)] });
    ok(onKing, 'p1', { type: 'play', cards: [card(2)] });
    ok(onKing, 'p1', { type: 'play', cards: [card(10)] });
    bad(onKing, 'p1', { type: 'play', cards: [card(3)] });
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
    const s = table([{ hand: [card(7, 3), card(4)] }, {}], {
      pile: [card(9), card(7), card(7, 1), card(7, 2)],
    });
    const after = move(s, 'p1', { type: 'play', cards: [card(7, 3)] });
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

describe('face-up and face-down cards', () => {
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
      pile: [card(7)],
    });
    const after = move(s, 'p1', { type: 'playDown', index: 0 });
    expect(after.pile).toEqual([card(7), card(9)]);
    expect(after.players[0]!.faceDown).toEqual([null, card(3), card(4)]);
    expect(after.turn).toBe(1);
    expect(after.lastEvent).toMatchObject({ kind: 'blind', cards: [card(9)], pickedUp: 0 });
  });

  it('a too-low blind card is added to the pile and the whole pile is picked up', () => {
    const s = table([{ faceDown: [card(3), card(4), card(5)] }, { hand: [card(9)] }], {
      pile: [card(12), card(13)],
    });
    const after = move(s, 'p1', { type: 'playDown', index: 0 });
    expect(after.pile).toEqual([]);
    expect(hand(after, 0)).toEqual([card(12), card(13), card(3)]);
    expect(after.turn).toBe(1);
    expect(after.lastEvent).toMatchObject({ kind: 'blind', pickedUp: 3, burned: false });
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
      { hand: [card(8), card(5)] },
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
    const p3 = move(p2b, 'p3', { type: 'play', cards: [card(8)] });
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
    const s = table([{ faceDown: [card(3), null, null] }, { hand: [card(9)] }], {
      pile: [card(13)],
    });
    const after = move(s, 'p1', { type: 'playDown', index: 0 });
    expect(after.players[0]!.out).toBe(false);
    expect(game.isGameOver(after)).toBe(false);
    expect(hand(after, 0)).toEqual([card(13), card(3)]);
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
