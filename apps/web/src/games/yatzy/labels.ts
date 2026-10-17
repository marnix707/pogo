import type { yatzy } from '@pogo/shared';

type Category = yatzy.Category;

export const CATEGORY_LABEL: Record<Category, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfAKind: 'Three of a kind',
  fourOfAKind: 'Four of a kind',
  fullHouse: 'Full house',
  smallStraight: 'Small straight',
  largeStraight: 'Large straight',
  yatzy: 'Yatzy',
  chance: 'Chance',
};

/** Short rule reminder shown under the category name. */
export const CATEGORY_HINT: Partial<Record<Category, string>> = {
  threeOfAKind: 'sum of all dice',
  fourOfAKind: 'sum of all dice',
  fullHouse: '25 points',
  smallStraight: '30 points',
  largeStraight: '40 points',
  yatzy: '50 points',
  chance: 'sum of all dice',
};
