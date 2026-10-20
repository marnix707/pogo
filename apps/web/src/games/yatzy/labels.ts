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

/** Fixed point values, shown small next to the name (the other rules are well known). */
export const CATEGORY_HINT: Partial<Record<Category, string>> = {
  fullHouse: '25',
  smallStraight: '30',
  largeStraight: '40',
  yatzy: '50',
};

/** The die face each upper-section row is about (its colour matches the dice). */
export const UPPER_FACE: Partial<Record<Category, number>> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
};
