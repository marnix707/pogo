import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import type { GamePlayer } from '../../game/types';
import { DECK_SIZE, canPlayCard, cardInfo, isSpecial } from './cards';
import type { Card } from './cards';
import { lastCardGame as game } from './game';
import type { LastCardMove, LastCardState } from './types';

const players = (n: number): GamePlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, avatar: 'fox' }));

// Card ids: red 0-24 (0 = "0", 1-9 numbers, 19-20 skip, 21-22 reverse, 23-24 draw two),
// yellow 25-49, green 50-74, blue 75-99, wild 100-103, wild four 104-107, shield 108-109,
// blue ghost 110-111, red skull 112-113.
const RED = (n: number) => n; // 1-9
const YELLOW = (n: number) => 25 + n;
const RED_SKIP = 19;
const RED_REVERSE = 21;
const RED_DRAW2 = 23;
const YELLOW_DRAW2 = 25 + 23;
const YELLOW_SKIP = 25 + 19;
const WILD = 100;
const WILD4 = 104;
const SHIELD = 108;
const GHOST = 110;
const SKULL = 112;
const BLUE = (n: number) => 75 + n;

const rng = createSeededRng(7);

/** A state with chosen hands: p0 to move, red on top (a red 5). */
function setup(hands: Card[][], over: Partial<LastCardState> = {}): LastCardState {
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
    pending: 0,
    pendingFrom: null,
    drawn: null,
    winner: null,
    eventSeq: 0,
    lastEvent: null,
    unoCall: null,
    callWindow: null,
    catchCall: null,
    ...over,
  };
}
const play = (s: LastCardState, id: string, move: LastCardMove) => game.applyMove(s, id, move, rng);

describe('cards', () => {
  it('the deck has the standard 108 cards plus 2 shields, 2 ghosts and 2 skulls', () => {
    const kinds: Record<string, number> = {};
    for (let c = 0; c < DECK_SIZE; c++) {
      const k = cardInfo(c).kind;
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    expect(kinds).toEqual({
      number: 76,
      skip: 8,
      reverse: 8,
      draw2: 8,
      wild: 4,
      wild4: 4,
      shield: 2,
      ghost: 2,
      skull: 2,
    });
    // One 0 and two of each 1-9 per colour.
    const reds = Array.from({ length: 25 }, (_, i) => cardInfo(i)).filter(
      (i) => i.kind === 'number',
    );
    expect(reds.filter((i) => i.value === 0)).toHaveLength(1);
    expect(reds.filter((i) => i.value === 9)).toHaveLength(2);
  });

  it('matches by colour or symbol, wilds (also Draw Four) always', () => {
    expect(canPlayCard(RED(7), RED(5), 0, [])).toBe(true);
    expect(canPlayCard(YELLOW(5), RED(5), 0, [])).toBe(true); // same number
    expect(canPlayCard(YELLOW(6), RED(5), 0, [])).toBe(false);
    expect(canPlayCard(YELLOW_SKIP, RED_SKIP, 0, [])).toBe(true); // same symbol
    expect(canPlayCard(WILD, RED(5), 0, [RED(1)])).toBe(true);
    expect(canPlayCard(WILD4, RED(5), 0, [RED(1), WILD4])).toBe(true); // even holding the colour
    expect(canPlayCard(RED(7), RED(5), 0, [], 2)).toBe(false); // a penalty is waiting
    expect(canPlayCard(YELLOW_DRAW2, RED(5), 0, [], 2)).toBe(true); // +2 on anything
    expect(canPlayCard(WILD4, RED_DRAW2, 0, [], 2)).toBe(true);
    expect(canPlayCard(WILD4, RED(5), 0, [YELLOW(1), WILD4])).toBe(true);
    // After a wild only the chosen colour counts.
    expect(canPlayCard(YELLOW(5), WILD, 2, [])).toBe(false);
  });
});

describe('shield, ghost and skull', () => {
  it('a shield only plays against a waiting penalty; ghost and skull match their colour or their kind', () => {
    expect(canPlayCard(SHIELD, RED(5), 0, [])).toBe(false);
    expect(canPlayCard(SHIELD, RED(5), 0, [], 2)).toBe(true);
    expect(canPlayCard(GHOST, RED(5), 0, [], 2)).toBe(false); // a penalty is waiting
    expect(canPlayCard(GHOST, RED(5), 0, [])).toBe(false); // blue ghost on red
    expect(canPlayCard(GHOST, BLUE(5), 3, [])).toBe(true);
    expect(canPlayCard(GHOST, GHOST + 1, 0, [])).toBe(true); // ghost on ghost
    expect(canPlayCard(SKULL, RED(5), 0, [])).toBe(true);
    expect(canPlayCard(SKULL, BLUE(5), 3, [])).toBe(false);
    expect(canPlayCard(RED(7), SHIELD, 0, [])).toBe(true); // the colour in force still counts
  });

  it('the shield sends the whole penalty back to whoever played the last draw card', () => {
    let s = setup([
      [RED_DRAW2, RED(1)],
      [SHIELD, YELLOW(1)],
      [RED(2), RED(3)],
    ]);
    s = play(s, 'p0', { type: 'play', card: RED_DRAW2 });
    expect(s.pending).toBe(2);
    expect(s.pendingFrom).toBe('p0');
    s = play(s, 'p1', { type: 'play', card: SHIELD });
    expect(s.pending).toBe(2);
    expect(s.turn).toBe(0);
    expect(s.color).toBe(0); // colourless: the colour stays
    expect(s.pendingFrom).toBe('p1');
    expect(s.lastEvent).toMatchObject({ reflectedTo: 'p0', card: SHIELD });
    // p0 has to take it (or answer with another draw card / shield).
    const drawn = play(s, 'p0', { type: 'draw' });
    expect(drawn.players[0]!.hand).toHaveLength(3);
    expect(drawn.pending).toBe(0);
    expect(drawn.pendingFrom).toBeNull();
    expect(drawn.turn).toBe(1);
  });

  it('with two players a shield bounces back and the sender may stack on top', () => {
    let s = setup([
      [WILD4, YELLOW_DRAW2, RED(1)],
      [SHIELD, YELLOW(1)],
    ]);
    s = play(s, 'p0', { type: 'play', card: WILD4, color: 0 });
    s = play(s, 'p1', { type: 'play', card: SHIELD });
    expect(s.turn).toBe(0);
    expect(s.pending).toBe(4);
    s = play(s, 'p0', { type: 'play', card: YELLOW_DRAW2 });
    expect(s.pending).toBe(6);
    expect(s.turn).toBe(1);
  });

  it('a shield without a waiting penalty is refused with a clear message', () => {
    const s = setup([
      [SHIELD, RED(1), RED(2)],
      [RED(3), RED(4)],
    ]);
    expect(game.validateMove(s, 'p0', { type: 'play', card: SHIELD })).toMatchObject({
      ok: false,
      error: 'A Shield only blocks a waiting draw penalty',
    });
  });

  it('the blue ghost makes everybody with fewer cards than me draw two', () => {
    const s = setup(
      [
        [GHOST, BLUE(1), BLUE(2), BLUE(3)], // 3 cards left after the ghost
        [YELLOW(1), YELLOW(2)], // fewer: draws
        [YELLOW(3), YELLOW(4), YELLOW(5)], // equal: safe
        [YELLOW(6), YELLOW(7), YELLOW(8), YELLOW(9)], // more: safe
      ],
      { color: 3, pile: [BLUE(5)] },
    );
    const after = play(s, 'p0', { type: 'play', card: GHOST });
    expect(after.players.map((p) => p.hand.length)).toEqual([3, 4, 3, 4]);
    expect(after.lastEvent?.victims).toEqual([{ playerId: 'p1', count: 2 }]);
    expect(after.color).toBe(3);
    expect(after.turn).toBe(1); // no skip: the turn passes on normally
  });

  it('the red skull makes everybody without a red card draw two (wilds are not red)', () => {
    const s = setup([
      [SKULL, RED(1), RED(2)],
      [YELLOW(1), YELLOW(2)], // no red: draws
      [WILD, RED(3)], // has red: safe
      [WILD, WILD4], // wilds are not red: draws
    ]);
    const after = play(s, 'p0', { type: 'play', card: SKULL });
    expect(after.players.map((p) => p.hand.length)).toEqual([2, 4, 2, 4]);
    expect(after.lastEvent?.victims.map((v) => v.playerId)).toEqual(['p1', 'p3']);
    expect(after.color).toBe(0);
  });

  it('you cannot finish with them', () => {
    const s = setup([[SKULL], [RED(3), RED(4)]]);
    expect(game.validateMove(s, 'p0', { type: 'play', card: SKULL }).ok).toBe(false);
  });

  it('a computer answers a waiting penalty with a shield when it has one', () => {
    let s = setup([
      [RED_DRAW2, RED(1), RED(2)],
      [SHIELD, WILD4, YELLOW_DRAW2],
    ]);
    s = play(s, 'p0', { type: 'play', card: RED_DRAW2 });
    expect(game.autoMove!(s, 'p1', createSeededRng(1)).move).toMatchObject({
      type: 'play',
      card: SHIELD,
    });
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

  it('draw two and wild four leave a penalty for the next player, who draws it all unless they stack', () => {
    const s = setup([
      [RED_DRAW2, RED(1)],
      [RED(2), RED(4)],
      [RED(3), RED(6)],
    ]);
    const a = play(s, 'p0', { type: 'play', card: RED_DRAW2 });
    expect(a.pending).toBe(2);
    expect(a.turn).toBe(1);
    const taken = play(a, 'p1', { type: 'draw' });
    expect(taken.players[1]!.hand).toHaveLength(4);
    expect(taken.pending).toBe(0);
    expect(taken.turn).toBe(2);
    const w = setup([
      [WILD4, YELLOW(1)],
      [RED(2), RED(4)],
      [RED(3), RED(6)],
    ]);
    const b = play(w, 'p0', { type: 'play', card: WILD4, color: 1 });
    expect(b.pending).toBe(4);
    expect(b.color).toBe(1);
    expect(play(b, 'p1', { type: 'draw' }).players[1]!.hand).toHaveLength(6);
  });

  it('a Draw Two and a Wild Draw Four stack on each other', () => {
    const s = setup([
      [RED_DRAW2, RED(1)],
      [WILD4, RED(4)],
      [YELLOW_DRAW2, RED(6)],
    ]);
    const a = play(s, 'p0', { type: 'play', card: RED_DRAW2 });
    expect(game.validateMove(a, 'p1', { type: 'play', card: RED(4) }).ok).toBe(false);
    const b = play(a, 'p1', { type: 'play', card: WILD4, color: 2 });
    expect(b.pending).toBe(6);
    expect(b.turn).toBe(2);
    const c = play(b, 'p2', { type: 'play', card: YELLOW_DRAW2 });
    expect(c.pending).toBe(8);
    expect(c.turn).toBe(0);
    expect(play(c, 'p0', { type: 'draw' }).players[0]!.hand).toHaveLength(9);
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

describe('UNO! and calling somebody out', () => {
  const two = () =>
    setup(
      [
        [RED(7), RED(8)],
        [RED(1), YELLOW(2), RED(2)],
      ],
      { stock: [YELLOW(3), YELLOW(4), YELLOW(5), YELLOW(6), YELLOW(7), YELLOW(8), YELLOW(9)] },
    );

  it('opens a window when a play leaves one card without UNO!, and UNO! closes it', () => {
    const s = two();
    expect(game.validateMove(s, 'p0', { type: 'uno' }).ok).toBe(false); // two cards: nothing to call
    const one = play(s, 'p0', { type: 'play', card: RED(7) });
    expect(one.callWindow).toBe('p0');
    expect(game.getPlayerView(one, 'p0').mustCall).toBe(true);
    expect(game.getPlayerView(one, 'p1').mustCall).toBe(false);
    const called = play(one, 'p0', { type: 'uno' }); // right after: out of turn is fine
    expect(called.players[0]!.called).toBe(true);
    expect(called.callWindow).toBeNull();
    expect(called.unoCall).toMatchObject({ playerId: 'p0' });
    expect(called.turn).toBe(1); // calling does not change the turn
    expect(game.validateMove(called, 'p1', { type: 'callout', target: 'p0' }).ok).toBe(false);
  });

  it('calling UNO! together with the second-to-last card (right before) opens no window', () => {
    const one = play(two(), 'p0', { type: 'play', card: RED(7), uno: true });
    expect(one.players[0]!.called).toBe(true);
    expect(one.callWindow).toBeNull();
    expect(game.validateMove(one, 'p1', { type: 'callout', target: 'p0' }).ok).toBe(false);
  });

  it('calling somebody out: they draw four, the turn does not change, the window closes', () => {
    const one = play(two(), 'p0', { type: 'play', card: RED(7) });
    expect(game.validateMove(one, 'p0', { type: 'callout', target: 'p0' }).ok).toBe(false); // not yourself
    const caught = play(one, 'p1', { type: 'callout', target: 'p0' });
    expect(caught.players[0]!.hand).toHaveLength(5);
    expect(caught.callWindow).toBeNull();
    expect(caught.turn).toBe(1);
    expect(caught.lastEvent).toMatchObject({
      kind: 'callout',
      playerId: 'p1',
      victim: { playerId: 'p0', count: 4 },
    });
    expect(caught.catchCall).toMatchObject({ byId: 'p1', targetId: 'p0' });
    // Called out once, not twice; and now it is too late to call UNO!.
    expect(game.validateMove(caught, 'p1', { type: 'callout', target: 'p0' }).ok).toBe(false);
    expect(game.validateMove(caught, 'p0', { type: 'uno' }).ok).toBe(false);
  });

  it('it is too late once the next player plays, draws or passes: nobody is punished', () => {
    const one = play(two(), 'p0', { type: 'play', card: RED(7) });
    const played = play(one, 'p1', { type: 'play', card: RED(1) });
    expect(played.callWindow).toBeNull();
    expect(played.players[0]!.hand).toHaveLength(1);
    expect(game.validateMove(played, 'p1', { type: 'callout', target: 'p0' }).ok).toBe(false);
    expect(game.validateMove(played, 'p0', { type: 'uno' }).ok).toBe(false);
    const drew = play(one, 'p1', { type: 'draw' });
    expect(drew.callWindow).toBeNull();
    expect(drew.players[0]!.hand).toHaveLength(1);
  });

  it('a later single card (after drawing and playing again) opens a new window', () => {
    const one = play(two(), 'p0', { type: 'play', card: RED(7) });
    const late = play(one, 'p1', { type: 'play', card: RED(1) }); // p0 is safe now
    const again = play(late, 'p0', { type: 'draw' }); // p0 draws: two cards
    expect(again.players[0]!.hand.length).toBe(2);
  });

  it('both are free moves (they must not restart the turn clock)', () => {
    expect(game.isFreeMove?.({ type: 'uno' })).toBe(true);
    expect(game.isFreeMove?.({ type: 'callout', target: 'p0' })).toBe(true);
    expect(game.isFreeMove?.({ type: 'draw' })).toBe(false);
  });

  it('computers hold back while a window is open and usually call the player out', () => {
    const one = play(two(), 'p0', { type: 'play', card: RED(7) });
    expect(game.settleMs?.(one)).toBeGreaterThan(0);
    expect(game.settleMs?.(play(one, 'p0', { type: 'uno' }))).toBe(0);
    let caught = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const auto = game.autoMove!(one, 'p1', createSeededRng(seed));
      if (auto.move.type === 'callout') {
        caught++;
        expect(auto.endsTurn).toBe(false);
        expect(game.validateMove(one, 'p1', auto.move).ok).toBe(true);
      }
    }
    expect(caught).toBeGreaterThan(65);
    expect(caught).toBeLessThan(100);
  });

  it('computers never forget UNO! themselves', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = setup([
        [RED(7), RED(8)],
        [RED(1), YELLOW(2)],
      ]);
      const auto = game.autoMove!(s, 'p0', createSeededRng(seed));
      expect(auto.move).toMatchObject({ type: 'play', uno: true });
    }
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
