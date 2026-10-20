import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import { createDiceRng } from '../../game/testing';
import type { GamePlayer } from '../../game/types';
import { getGame } from '../registry';
import { yatzyGame as game } from './game';
import { getTotals } from './scoring';
import { CATEGORIES, ROUNDS } from './types';
import type { YatzyMove, YatzyState } from './types';

const players = (n: number): GamePlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, avatar: 'fox' }));

const none = [false, false, false, false, false];
const start = (n = 2) => game.createInitialState(players(n), {}, createSeededRng(1));
const ROLL: YatzyMove = { type: 'roll', held: none };

function play(state: YatzyState, id: string, move: YatzyMove, faces: number[] = []): YatzyState {
  return game.applyMove(state, id, move, createDiceRng(faces));
}

describe('setup', () => {
  it('creates a fresh state for 1-6 players', () => {
    const s = start(3);
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(s.round).toBe(1);
    expect(s.rollsLeft).toBe(3);
    expect(s.dice).toEqual([]);
    expect(game.getCurrentPlayers(s)).toEqual(['p1']);
    expect(game.isGameOver(s)).toBe(false);
  });

  it('rejects 0 or 7 players and supports solo', () => {
    expect(() => game.createInitialState([], {}, createSeededRng(1))).toThrow();
    expect(() => game.createInitialState(players(7), {}, createSeededRng(1))).toThrow();
    expect(start(1).players).toHaveLength(1);
  });

  it('is registered', () => {
    expect(getGame('yatzy')).toBe(game);
    expect(getGame('nope')).toBeUndefined();
    expect(getGame('__proto__')).toBeUndefined();
  });
});

describe('rolling', () => {
  it('rolls all five dice on the first roll', () => {
    const s = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    expect(s.dice).toEqual([1, 2, 3, 4, 5]);
    expect(s.rollsLeft).toBe(2);
  });

  it('ignores holds on the first roll', () => {
    const s = play(
      start(),
      'p1',
      { type: 'roll', held: [true, true, true, true, false] },
      [1, 2, 3, 4, 5],
    );
    expect(s.dice).toEqual([1, 2, 3, 4, 5]);
    expect(s.held).toEqual(none);
  });

  it('keeps held dice and rerolls the rest', () => {
    let s = play(start(), 'p1', ROLL, [6, 6, 1, 2, 3]);
    s = play(s, 'p1', { type: 'roll', held: [true, true, false, false, false] }, [6, 6, 6]);
    expect(s.dice).toEqual([6, 6, 6, 6, 6]);
    expect(s.held).toEqual([true, true, false, false, false]);
    expect(s.rollsLeft).toBe(1);
  });

  it('allows exactly three rolls per turn', () => {
    let s = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    s = play(s, 'p1', ROLL, [1, 2, 3, 4, 5]);
    s = play(s, 'p1', ROLL, [1, 2, 3, 4, 5]);
    expect(s.rollsLeft).toBe(0);
    expect(game.validateMove(s, 'p1', ROLL)).toEqual({
      ok: false,
      error: 'No rolls left, pick a category',
    });
  });

  it('shares holds before the next roll without using a roll', () => {
    const rolled = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    const hold: YatzyMove = { type: 'hold', held: [true, false, true, false, false] };
    expect(game.validateMove(rolled, 'p1', hold)).toEqual({ ok: true });
    const after = play(rolled, 'p1', hold);
    expect(after.held).toEqual([true, false, true, false, false]);
    expect(after.rollsLeft).toBe(rolled.rollsLeft);
    expect(after.dice).toEqual(rolled.dice);
    expect(game.isFreeMove?.(hold)).toBe(true);
    expect(game.isFreeMove?.(ROLL)).toBe(false);
  });

  it('rejects holds before the first roll, out of turn and with no rolls left', () => {
    const hold: YatzyMove = { type: 'hold', held: none };
    expect(game.validateMove(start(), 'p1', hold).ok).toBe(false);
    const rolled = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    expect(game.validateMove(rolled, 'p2', hold).ok).toBe(false);
    let s = rolled;
    s = play(s, 'p1', ROLL, [1, 1, 1, 1, 1]);
    s = play(s, 'p1', ROLL, [1, 1, 1, 1, 1]);
    expect(game.validateMove(s, 'p1', hold).ok).toBe(false);
  });

  it('rejects rolling when every die is held', () => {
    const s = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    const all: YatzyMove = { type: 'roll', held: [true, true, true, true, true] };
    expect(game.validateMove(s, 'p1', all).ok).toBe(false);
  });

  it('rejects out-of-turn moves', () => {
    expect(game.validateMove(start(), 'p2', ROLL)).toEqual({ ok: false, error: 'Not your turn' });
    expect(game.validateMove(start(), 'ghost', ROLL).ok).toBe(false);
  });

  it('throws when applying an invalid move', () => {
    expect(() => game.applyMove(start(), 'p2', ROLL, createSeededRng(1))).toThrow('Not your turn');
  });

  it('does not mutate the previous state', () => {
    const before = start();
    const snapshot = JSON.stringify(before);
    play(before, 'p1', ROLL, [1, 2, 3, 4, 5]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('scoring a turn', () => {
  it('requires a roll first', () => {
    const move: YatzyMove = { type: 'score', category: 'chance' };
    expect(game.validateMove(start(), 'p1', move)).toEqual({
      ok: false,
      error: 'Roll the dice first',
    });
  });

  it('records the score, passes the turn, and resets the dice', () => {
    let s = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    s = play(s, 'p1', { type: 'score', category: 'largeStraight' });
    expect(s.players[0]!.scorecard).toEqual({ largeStraight: 40 });
    expect(game.getCurrentPlayers(s)).toEqual(['p2']);
    expect(s.dice).toEqual([]);
    expect(s.rollsLeft).toBe(3);
    expect(s.round).toBe(1);
  });

  it('advances the round after the last player', () => {
    let s = play(start(), 'p1', ROLL, [1, 2, 3, 4, 5]);
    s = play(s, 'p1', { type: 'score', category: 'chance' });
    s = play(s, 'p2', ROLL, [1, 1, 1, 1, 2]);
    s = play(s, 'p2', { type: 'score', category: 'ones' });
    expect(s.round).toBe(2);
    expect(game.getCurrentPlayers(s)).toEqual(['p1']);
  });

  it('allows scoring 0 and prevents reusing a category', () => {
    let s = play(start(1), 'p1', ROLL, [1, 2, 3, 4, 5]);
    s = play(s, 'p1', { type: 'score', category: 'yatzy' });
    expect(s.players[0]!.scorecard.yatzy).toBe(0);
    s = play(s, 'p1', ROLL, [1, 2, 3, 4, 5]);
    expect(game.validateMove(s, 'p1', { type: 'score', category: 'yatzy' })).toEqual({
      ok: false,
      error: 'Category not available',
    });
  });
});

describe('extra Yatzys', () => {
  const withYatzyBox = (value: number): YatzyState => {
    const s = start(1);
    return { ...s, players: [{ ...s.players[0]!, scorecard: { yatzy: value } }] };
  };

  it('award +100 and force the matching upper box', () => {
    let s = play(withYatzyBox(50), 'p1', ROLL, [5, 5, 5, 5, 5]);
    expect(game.validateMove(s, 'p1', { type: 'score', category: 'chance' }).ok).toBe(false);
    s = play(s, 'p1', { type: 'score', category: 'fives' });
    const p = s.players[0]!;
    expect(p.scorecard.fives).toBe(25);
    expect(p.yatzyBonuses).toBe(1);
    expect(getTotals(p.scorecard, p.yatzyBonuses).grandTotal).toBe(50 + 25 + 100);
  });

  it('award nothing when the Yatzy box holds 0, but Joker placement still applies', () => {
    let s = play(withYatzyBox(0), 'p1', ROLL, [5, 5, 5, 5, 5]);
    s = play(s, 'p1', { type: 'score', category: 'fives' });
    expect(s.players[0]!.yatzyBonuses).toBe(0);
  });

  it('score a Joker full house for 25 once the upper box is used', () => {
    const base = withYatzyBox(50);
    const s0: YatzyState = {
      ...base,
      players: [{ ...base.players[0]!, scorecard: { yatzy: 50, sixes: 30 } }],
    };
    let s = play(s0, 'p1', ROLL, [6, 6, 6, 6, 6]);
    s = play(s, 'p1', { type: 'score', category: 'fullHouse' });
    expect(s.players[0]!.scorecard.fullHouse).toBe(25);
    expect(s.players[0]!.yatzyBonuses).toBe(1);
  });

  it('do not trigger the bonus when scoring the first Yatzy', () => {
    let s = play(start(1), 'p1', ROLL, [3, 3, 3, 3, 3]);
    s = play(s, 'p1', { type: 'score', category: 'yatzy' });
    expect(s.players[0]!.scorecard.yatzy).toBe(50);
    expect(s.players[0]!.yatzyBonuses).toBe(0);
  });
});

describe('full games', () => {
  function playToEnd(n: number, seed: number) {
    const rng = createSeededRng(seed);
    let s = game.createInitialState(players(n), {}, rng);
    let scoreMoves = 0;
    let guard = 0;
    while (!game.isGameOver(s)) {
      if (guard++ > 5000) throw new Error('Game did not terminate');
      const [id] = game.getCurrentPlayers(s);
      const { move } = game.autoMove!(s, id!, rng);
      expect(game.validateMove(s, id!, move)).toEqual({ ok: true });
      if (move.type === 'score') scoreMoves++;
      s = game.applyMove(s, id!, move, rng);
    }
    return { s, scoreMoves };
  }

  it.each([1, 2, 3, 4, 5, 6])('autoMove completes a %i-player game in 13 rounds', (n) => {
    const { s, scoreMoves } = playToEnd(n, 100 + n);
    expect(scoreMoves).toBe(ROUNDS * n);
    expect(s.round).toBe(ROUNDS);
    for (const p of s.players) {
      expect(CATEGORIES.every((c) => p.scorecard[c] !== undefined)).toBe(true);
    }
    expect(game.getCurrentPlayers(s)).toEqual([]);
    expect(game.validateMove(s, 'p1', ROLL).ok).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    expect(playToEnd(3, 7).s).toEqual(playToEnd(3, 7).s);
    expect(playToEnd(3, 7).s).not.toEqual(playToEnd(3, 8).s);
  });

  it('plays many random games without ever producing an invalid state', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { s } = playToEnd((seed % 6) + 1, seed);
      for (const p of s.players) {
        const t = getTotals(p.scorecard, p.yatzyBonuses);
        expect(t.grandTotal).toBeGreaterThanOrEqual(0);
        expect(t.grandTotal).toBeLessThanOrEqual(1500);
      }
    }
  });
});

describe('results', () => {
  const finished = (scores: number[]): YatzyState => {
    const s = start(scores.length);
    return {
      ...s,
      finished: true,
      players: s.players.map((p, i) => ({ ...p, scorecard: { chance: scores[i]! } })),
    };
  };

  it('ranks by total score, highest first', () => {
    const r = game.getResults(finished([10, 30, 20]));
    expect(r.rankings).toEqual([
      { playerId: 'p2', score: 30, rank: 1 },
      { playerId: 'p3', score: 20, rank: 2 },
      { playerId: 'p1', score: 10, rank: 3 },
    ]);
  });

  it('gives tied players the same rank', () => {
    const r = game.getResults(finished([20, 20, 10]));
    expect(r.rankings.map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it('solo game ranks the single player first', () => {
    expect(game.getResults(finished([42])).rankings).toEqual([
      { playerId: 'p1', score: 42, rank: 1 },
    ]);
  });
});

describe('wire schemas', () => {
  it('accepts valid moves', () => {
    expect(game.moveSchema.safeParse({ type: 'roll', held: none }).success).toBe(true);
    expect(game.moveSchema.safeParse({ type: 'score', category: 'chance' }).success).toBe(true);
  });

  it('rejects malformed moves', () => {
    expect(game.moveSchema.safeParse({ type: 'roll', held: [true] }).success).toBe(false);
    expect(game.moveSchema.safeParse({ type: 'score', category: 'bogus' }).success).toBe(false);
    expect(game.moveSchema.safeParse({ type: 'cheat', dice: [6, 6, 6, 6, 6] }).success).toBe(false);
    expect(game.moveSchema.safeParse(null).success).toBe(false);
  });

  it('accepts empty options and rejects unknown ones', () => {
    expect(game.optionsSchema.safeParse({}).success).toBe(true);
    expect(game.optionsSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('shows every player the same (public) view', () => {
    const s = start();
    expect(game.getPlayerView(s, 'p2')).toBe(s);
  });
});
