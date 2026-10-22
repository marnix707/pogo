import {
  CATEGORIES,
  FULL_HOUSE_SCORE,
  LARGE_STRAIGHT_SCORE,
  LOWER_CATEGORIES,
  SMALL_STRAIGHT_SCORE,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  UPPER_CATEGORIES,
  YATZY_BONUS,
  YATZY_SCORE,
} from './types';
import type { Category, Scorecard, UpperCategory } from './types';

const UPPER_BY_FACE: readonly UpperCategory[] = UPPER_CATEGORIES;

function faceCounts(dice: readonly number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 1..6
  for (const d of dice) counts[d] = (counts[d] ?? 0) + 1;
  return counts;
}

const sum = (dice: readonly number[]) => dice.reduce((a, b) => a + b, 0);

export function isYatzy(dice: readonly number[]): boolean {
  return dice.length > 0 && dice.every((d) => d === dice[0]);
}

function hasRun(dice: readonly number[], length: number): boolean {
  const present = new Set(dice);
  for (let start = 1; start + length - 1 <= 6; start++) {
    if (Array.from({ length }, (_, i) => start + i).every((f) => present.has(f))) return true;
  }
  return false;
}

/** Score of a category under the normal rules (no Joker). */
export function rawScore(dice: readonly number[], category: Category): number {
  const counts = faceCounts(dice);
  const maxCount = Math.max(...counts);
  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = UPPER_BY_FACE.indexOf(category) + 1;
      return face * (counts[face] ?? 0);
    }
    case 'threeOfAKind':
      return maxCount >= 3 ? sum(dice) : 0;
    case 'fourOfAKind':
      return maxCount >= 4 ? sum(dice) : 0;
    case 'fullHouse': {
      // Exactly a pair and a triple; five of a kind is not a full house (only via Joker).
      const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
      return nonZero.length === 2 && nonZero[0] === 2 && nonZero[1] === 3 ? FULL_HOUSE_SCORE : 0;
    }
    case 'smallStraight':
      return hasRun(dice, 4) ? SMALL_STRAIGHT_SCORE : 0;
    case 'largeStraight':
      return hasRun(dice, 5) ? LARGE_STRAIGHT_SCORE : 0;
    case 'yatzy':
      return isYatzy(dice) ? YATZY_SCORE : 0;
    case 'chance':
      return sum(dice);
  }
}

/**
 * Which dice (indices into `dice`) the UI counts when `category` was scored with `score` points: the
 * dice of that face for the upper boxes, the four dice of the run for a small straight, all five for
 * the others; none when the box scored nothing.
 */
export function scoringDiceIndices(
  dice: readonly number[],
  category: Category,
  score: number,
): number[] {
  if (score <= 0) return [];
  const all = dice.map((_, i) => i);
  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = UPPER_BY_FACE.indexOf(category) + 1;
      return all.filter((i) => dice[i] === face);
    }
    case 'smallStraight': {
      for (let start = 1; start <= 3; start++) {
        const faces = [start, start + 1, start + 2, start + 3];
        if (faces.every((f) => dice.includes(f))) return faces.map((f) => dice.indexOf(f));
      }
      return all;
    }
    default:
      return all;
  }
}

/** Joker rules apply when the dice are a Yatzy and the Yatzy box is already filled (50 or 0). */
export function isJoker(dice: readonly number[], scorecard: Scorecard): boolean {
  return isYatzy(dice) && scorecard.yatzy !== undefined;
}

/** True when scoring these dice earns the +100 extra-Yatzy bonus (Yatzy box holds 50). */
export function earnsYatzyBonus(dice: readonly number[], scorecard: Scorecard): boolean {
  return isJoker(dice, scorecard) && scorecard.yatzy === YATZY_SCORE;
}

export function getOpenCategories(scorecard: Scorecard): Category[] {
  return CATEGORIES.filter((c) => scorecard[c] === undefined);
}

/** Categories the player may choose for these dice, honouring the forced Joker placement. */
export function getAllowedCategories(dice: readonly number[], scorecard: Scorecard): Category[] {
  const open = getOpenCategories(scorecard);
  if (!isJoker(dice, scorecard)) return open;

  const matchingUpper = UPPER_BY_FACE[(dice[0] ?? 1) - 1];
  if (matchingUpper && open.includes(matchingUpper)) return [matchingUpper];

  const openLower = open.filter((c) => (LOWER_CATEGORIES as readonly string[]).includes(c));
  return openLower.length > 0 ? openLower : open;
}

/** Points a category would score for these dice, including Joker full-value fixed categories. */
export function getScore(
  dice: readonly number[],
  category: Category,
  scorecard: Scorecard,
): number {
  if (isJoker(dice, scorecard)) {
    if (category === 'fullHouse') return FULL_HOUSE_SCORE;
    if (category === 'smallStraight') return SMALL_STRAIGHT_SCORE;
    if (category === 'largeStraight') return LARGE_STRAIGHT_SCORE;
  }
  return rawScore(dice, category);
}

/** What each choosable category would score right now (for the UI preview). */
export function getPreviewScores(
  dice: readonly number[],
  scorecard: Scorecard,
): Partial<Record<Category, number>> {
  const preview: Partial<Record<Category, number>> = {};
  for (const c of getAllowedCategories(dice, scorecard)) preview[c] = getScore(dice, c, scorecard);
  return preview;
}

export interface Totals {
  upperSubtotal: number;
  upperBonus: number;
  lowerTotal: number;
  yatzyBonus: number;
  grandTotal: number;
}

export function getTotals(scorecard: Scorecard, yatzyBonuses: number): Totals {
  const upperSubtotal = UPPER_CATEGORIES.reduce((s, c) => s + (scorecard[c] ?? 0), 0);
  const upperBonus = upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
  const lowerTotal = LOWER_CATEGORIES.reduce((s, c) => s + (scorecard[c] ?? 0), 0);
  const yatzyBonus = yatzyBonuses * YATZY_BONUS;
  return {
    upperSubtotal,
    upperBonus,
    lowerTotal,
    yatzyBonus,
    grandTotal: upperSubtotal + upperBonus + lowerTotal + yatzyBonus,
  };
}
