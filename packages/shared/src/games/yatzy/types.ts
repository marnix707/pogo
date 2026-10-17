export const UPPER_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as const;
export const LOWER_CATEGORIES = [
  'threeOfAKind',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yatzy',
  'chance',
] as const;
export const CATEGORIES = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES] as const;

export type UpperCategory = (typeof UPPER_CATEGORIES)[number];
export type LowerCategory = (typeof LOWER_CATEGORIES)[number];
export type Category = (typeof CATEGORIES)[number];

/** Filled categories only; a missing key means the category is still open. */
export type Scorecard = Partial<Record<Category, number>>;

export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;
export const ROUNDS = CATEGORIES.length; // 13

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const FULL_HOUSE_SCORE = 25;
export const SMALL_STRAIGHT_SCORE = 30;
export const LARGE_STRAIGHT_SCORE = 40;
export const YATZY_SCORE = 50;
export const YATZY_BONUS = 100;

export interface YatzyPlayerState {
  id: string;
  scorecard: Scorecard;
  /** Number of extra-Yatzy bonuses (+100 each) earned. */
  yatzyBonuses: number;
}

export interface YatzyState {
  players: YatzyPlayerState[];
  currentPlayerIndex: number;
  /** 1-based, 1..13. */
  round: number;
  /** Empty until the current player's first roll of the turn. */
  dice: number[];
  /** Which dice were kept on the latest roll. */
  held: boolean[];
  rollsLeft: number;
  finished: boolean;
}

export type YatzyMove = { type: 'roll'; held: boolean[] } | { type: 'score'; category: Category };

export type YatzyOptions = Record<string, never>;
