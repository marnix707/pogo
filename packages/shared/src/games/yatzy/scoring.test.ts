import { describe, expect, it } from 'vitest';
import {
  earnsYatzyBonus,
  getAllowedCategories,
  getPreviewScores,
  getScore,
  getTotals,
  isJoker,
  rawScore,
  scoringDiceIndices,
} from './scoring';
import { CATEGORIES, LOWER_CATEGORIES, UPPER_CATEGORIES } from './types';
import type { Category, Scorecard } from './types';

const fill = (cats: readonly Category[], value = 0): Scorecard =>
  Object.fromEntries(cats.map((c) => [c, value]));

describe('scoringDiceIndices', () => {
  it('counts the dice of the face for the upper boxes', () => {
    expect(scoringDiceIndices([3, 1, 3, 3, 6], 'threes', 9)).toEqual([0, 2, 3]);
  });
  it('counts the four dice of a small straight and all five for the rest', () => {
    expect(scoringDiceIndices([2, 3, 4, 5, 5], 'smallStraight', 30)).toEqual([0, 1, 2, 3]);
    expect(scoringDiceIndices([2, 2, 3, 3, 3], 'fullHouse', 25)).toEqual([0, 1, 2, 3, 4]);
    expect(scoringDiceIndices([1, 2, 4, 5, 6], 'chance', 18)).toEqual([0, 1, 2, 3, 4]);
  });
  it('counts nothing for a box that scored 0', () => {
    expect(scoringDiceIndices([1, 2, 3, 4, 6], 'yatzy', 0)).toEqual([]);
  });
});

describe('upper section', () => {
  it('sums only the matching face', () => {
    expect(rawScore([1, 1, 2, 3, 1], 'ones')).toBe(3);
    expect(rawScore([2, 2, 5, 5, 6], 'twos')).toBe(4);
    expect(rawScore([3, 3, 3, 3, 3], 'threes')).toBe(15);
    expect(rawScore([4, 1, 2, 3, 5], 'fours')).toBe(4);
    expect(rawScore([5, 5, 5, 1, 1], 'fives')).toBe(15);
    expect(rawScore([6, 6, 1, 2, 3], 'sixes')).toBe(12);
  });

  it('scores 0 when the face is absent', () => {
    expect(rawScore([1, 2, 3, 4, 5], 'sixes')).toBe(0);
  });
});

describe('of a kind', () => {
  it('three of a kind sums all dice', () => {
    expect(rawScore([3, 3, 3, 4, 5], 'threeOfAKind')).toBe(18);
    expect(rawScore([3, 3, 4, 4, 5], 'threeOfAKind')).toBe(0);
  });

  it('four and five of a kind also count as three of a kind', () => {
    expect(rawScore([2, 2, 2, 2, 5], 'threeOfAKind')).toBe(13);
    expect(rawScore([4, 4, 4, 4, 4], 'threeOfAKind')).toBe(20);
  });

  it('four of a kind sums all dice', () => {
    expect(rawScore([2, 2, 2, 2, 5], 'fourOfAKind')).toBe(13);
    expect(rawScore([2, 2, 2, 5, 5], 'fourOfAKind')).toBe(0);
    expect(rawScore([4, 4, 4, 4, 4], 'fourOfAKind')).toBe(20);
  });
});

describe('full house', () => {
  it('scores 25 for a pair plus three of a kind', () => {
    expect(rawScore([2, 2, 3, 3, 3], 'fullHouse')).toBe(25);
    expect(rawScore([6, 1, 6, 1, 6], 'fullHouse')).toBe(25);
  });

  it('does not count four of a kind or two pairs', () => {
    expect(rawScore([2, 2, 2, 2, 3], 'fullHouse')).toBe(0);
    expect(rawScore([2, 2, 3, 3, 4], 'fullHouse')).toBe(0);
  });

  it('five of a kind is not a full house under normal rules', () => {
    expect(rawScore([4, 4, 4, 4, 4], 'fullHouse')).toBe(0);
    expect(getScore([4, 4, 4, 4, 4], 'fullHouse', {})).toBe(0);
  });
});

describe('straights', () => {
  it('small straight needs four in a row', () => {
    expect(rawScore([1, 2, 3, 4, 6], 'smallStraight')).toBe(30);
    expect(rawScore([3, 4, 5, 6, 3], 'smallStraight')).toBe(30);
    expect(rawScore([1, 2, 3, 5, 6], 'smallStraight')).toBe(0);
    expect(rawScore([1, 2, 4, 5, 6], 'smallStraight')).toBe(0);
  });

  it('small straight ignores duplicate dice', () => {
    expect(rawScore([2, 3, 4, 5, 5], 'smallStraight')).toBe(30);
    expect(rawScore([1, 2, 2, 3, 4], 'smallStraight')).toBe(30);
    expect(rawScore([4, 3, 3, 2, 1], 'smallStraight')).toBe(30);
    expect(rawScore([1, 1, 2, 2, 3], 'smallStraight')).toBe(0);
  });

  it('a large straight also satisfies a small straight', () => {
    expect(rawScore([1, 2, 3, 4, 5], 'smallStraight')).toBe(30);
    expect(rawScore([2, 3, 4, 5, 6], 'smallStraight')).toBe(30);
  });

  it('large straight needs five in a row, in any order', () => {
    expect(rawScore([1, 2, 3, 4, 5], 'largeStraight')).toBe(40);
    expect(rawScore([6, 2, 4, 3, 5], 'largeStraight')).toBe(40);
    expect(rawScore([1, 2, 3, 4, 6], 'largeStraight')).toBe(0);
    expect(rawScore([1, 3, 4, 5, 6], 'largeStraight')).toBe(0);
  });

  it('large straight rejects duplicates', () => {
    expect(rawScore([1, 2, 3, 4, 4], 'largeStraight')).toBe(0);
    expect(rawScore([2, 3, 4, 5, 5], 'largeStraight')).toBe(0);
  });
});

describe('yatzy and chance', () => {
  it('yatzy is 50 for five of a kind only', () => {
    expect(rawScore([6, 6, 6, 6, 6], 'yatzy')).toBe(50);
    expect(rawScore([1, 1, 1, 1, 1], 'yatzy')).toBe(50);
    expect(rawScore([6, 6, 6, 6, 5], 'yatzy')).toBe(0);
  });

  it('chance sums all dice', () => {
    expect(rawScore([1, 2, 3, 4, 6], 'chance')).toBe(16);
    expect(rawScore([6, 6, 6, 6, 6], 'chance')).toBe(30);
  });
});

describe('upper bonus', () => {
  const upper = (values: number[]): Scorecard =>
    Object.fromEntries(UPPER_CATEGORIES.map((c, i) => [c, values[i]]));

  it('is awarded at exactly 63', () => {
    // 3 of each face = 3+6+9+12+15+18 = 63
    const totals = getTotals(upper([3, 6, 9, 12, 15, 18]), 0);
    expect(totals.upperSubtotal).toBe(63);
    expect(totals.upperBonus).toBe(35);
    expect(totals.grandTotal).toBe(98);
  });

  it('is not awarded at 62', () => {
    const totals = getTotals(upper([2, 6, 9, 12, 15, 18]), 0);
    expect(totals.upperSubtotal).toBe(62);
    expect(totals.upperBonus).toBe(0);
  });

  it('is awarded above 63', () => {
    expect(getTotals(upper([5, 10, 15, 20, 25, 30]), 0).upperBonus).toBe(35);
  });

  it('adds lower scores and +100 per extra yatzy', () => {
    const card: Scorecard = { chance: 20, yatzy: 50, ones: 3 };
    const totals = getTotals(card, 2);
    expect(totals.lowerTotal).toBe(70);
    expect(totals.yatzyBonus).toBe(200);
    expect(totals.grandTotal).toBe(3 + 70 + 200);
  });
});

describe('Joker rules', () => {
  const yatzyFour = [4, 4, 4, 4, 4];

  it('are not active while the Yatzy box is open', () => {
    expect(isJoker(yatzyFour, {})).toBe(false);
    expect(getAllowedCategories(yatzyFour, {})).toEqual([...CATEGORIES]);
  });

  it('are not active for non-yatzy dice', () => {
    expect(isJoker([4, 4, 4, 4, 3], { yatzy: 50 })).toBe(false);
  });

  it('are active once the Yatzy box is filled, even with 0', () => {
    expect(isJoker(yatzyFour, { yatzy: 50 })).toBe(true);
    expect(isJoker(yatzyFour, { yatzy: 0 })).toBe(true);
  });

  it('earn the +100 bonus only if the Yatzy box holds 50', () => {
    expect(earnsYatzyBonus(yatzyFour, { yatzy: 50 })).toBe(true);
    expect(earnsYatzyBonus(yatzyFour, { yatzy: 0 })).toBe(false);
    expect(earnsYatzyBonus(yatzyFour, {})).toBe(false);
  });

  it('force the matching upper box when it is open', () => {
    expect(getAllowedCategories(yatzyFour, { yatzy: 50 })).toEqual(['fours']);
  });

  it('allow any open lower box once the matching upper box is filled', () => {
    const card: Scorecard = { yatzy: 50, fours: 8, chance: 22 };
    const allowed = getAllowedCategories(yatzyFour, card);
    expect(allowed).toEqual([
      'threeOfAKind',
      'fourOfAKind',
      'fullHouse',
      'smallStraight',
      'largeStraight',
    ]);
  });

  it('score full house, small and large straight at full value', () => {
    const card: Scorecard = { yatzy: 50, fours: 8 };
    expect(getScore(yatzyFour, 'fullHouse', card)).toBe(25);
    expect(getScore(yatzyFour, 'smallStraight', card)).toBe(30);
    expect(getScore(yatzyFour, 'largeStraight', card)).toBe(40);
  });

  it('score of-a-kind and chance as the dice sum', () => {
    const card: Scorecard = { yatzy: 50, fours: 8 };
    expect(getScore(yatzyFour, 'threeOfAKind', card)).toBe(20);
    expect(getScore(yatzyFour, 'fourOfAKind', card)).toBe(20);
    expect(getScore(yatzyFour, 'chance', card)).toBe(20);
  });

  it('let the player pick any open upper box (scoring 0) when all lower boxes are full', () => {
    const card: Scorecard = { ...fill(LOWER_CATEGORIES, 10), yatzy: 50, fours: 8 };
    expect(getAllowedCategories(yatzyFour, card)).toEqual([
      'ones',
      'twos',
      'threes',
      'fives',
      'sixes',
    ]);
    expect(getScore(yatzyFour, 'ones', card)).toBe(0);
  });

  it('only a Joker overrides full-value scoring (normal dice still score 0)', () => {
    expect(getScore([4, 4, 4, 4, 3], 'fullHouse', { yatzy: 50 })).toBe(0);
  });
});

describe('getPreviewScores', () => {
  it('shows a score for every open category and none for filled ones', () => {
    const preview = getPreviewScores([1, 2, 3, 4, 5], { chance: 10 });
    expect(Object.keys(preview)).toHaveLength(12);
    expect(preview.chance).toBeUndefined();
    expect(preview.largeStraight).toBe(40);
    expect(preview.ones).toBe(1);
  });

  it('only lists the forced category under a Joker', () => {
    expect(getPreviewScores([2, 2, 2, 2, 2], { yatzy: 50 })).toEqual({ twos: 10 });
  });
});
