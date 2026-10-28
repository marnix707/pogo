import type { Element, StageId } from './types';

export interface MonsterSpec {
  element: Element;
  /** Base and evolved name. */
  names: [string, string];
  /** Mana needed for the special attack. */
  cost: number;
  damage: [number, number];
  /** What the attack does besides damage, by form. */
  ability: string;
  /** Fire: columns cleared. Water: tiles turned into water. Electric: width of the cleared block (2 high). Psychic: mana drained from each of the opponent's monsters. */
  power: [number, number];
  /** Earth: hit points healed. */
  heal: [number, number];
  /** Short text on screen when the attack fires, by form. */
  effect: [string, string];
}

export const BERRIES_TO_EVOLVE = 4;
export const BOOST_MANA = 4;

export const MONSTERS: Readonly<Record<Element, MonsterSpec>> = {
  fire: {
    element: 'fire',
    names: ['Embit', 'Blazemaw'],
    cost: 6,
    damage: [20, 25],
    ability: 'Column Blast: damage, and a random column counts as matched (evolved: two columns).',
    power: [1, 2],
    heal: [0, 0],
    effect: ['Column blast!', 'Double column blast!'],
  },
  water: {
    element: 'water',
    names: ['Puddlo', 'Tidalurk'],
    cost: 7,
    damage: [10, 20],
    ability: 'Tidal Splash: damage, and turns 3 random tiles into water.',
    power: [3, 3],
    heal: [0, 0],
    effect: ['3 tiles to water!', '3 tiles to water!'],
  },
  earth: {
    element: 'earth',
    names: ['Sprigg', 'Thornback'],
    cost: 7,
    damage: [10, 15],
    ability: 'Harvest: damage, and heals you by the same amount.',
    power: [0, 0],
    heal: [10, 15],
    effect: ['Heal +10', 'Heal +15'],
  },
  electric: {
    element: 'electric',
    names: ['Zappip', 'Voltusk'],
    cost: 6,
    damage: [5, 10],
    ability: 'Overload: damage, and a random 2x2 block counts as matched (evolved: 3x2).',
    power: [2, 3],
    heal: [0, 0],
    effect: ['Spark 2x2!', 'Spark 3x2!'],
  },
  psychic: {
    element: 'psychic',
    names: ['Mindle', 'Oracull'],
    cost: 6,
    damage: [10, 15],
    ability: 'Mana Drain: damage, and every monster of the opponent loses 2 mana (evolved: 3).',
    power: [2, 3],
    heal: [0, 0],
    effect: ['Mana drain -2!', 'Mana drain -3!'],
  },
};

export interface StageSpec {
  id: StageId;
  name: string;
  /** The arena picture (Reactor and Swamp share the stadium). */
  arena: 'stadium' | 'forest-valley' | 'lava-caverns' | 'frost-lake';
  rule: string;
}

export const STAGE_SPECS: Readonly<Record<StageId, StageSpec>> = {
  stadium: { id: 'stadium', name: 'Stadium', arena: 'stadium', rule: 'No modifiers.' },
  forest: {
    id: 'forest',
    name: 'Forest Valley',
    arena: 'forest-valley',
    rule: 'Evolving needs 1 berry less.',
  },
  lava: {
    id: 'lava',
    name: 'Lava Caverns',
    arena: 'lava-caverns',
    rule: 'Every fire tile you match hurts your opponent.',
  },
  frost: {
    id: 'frost',
    name: 'Frost Lake',
    arena: 'frost-lake',
    rule: 'After a match the other tiles of the matched kinds freeze until after the next move.',
  },
  reactor: {
    id: 'reactor',
    name: 'Reactor',
    arena: 'stadium',
    rule: 'Bombs count down with every move and blow up in a cross.',
  },
  swamp: {
    id: 'swamp',
    name: 'Swamp',
    arena: 'stadium',
    rule: 'Every turn a random tile is hidden behind a "?".',
  },
};

export const evolveCost = (stage: StageId): number =>
  stage === 'forest' ? BERRIES_TO_EVOLVE - 1 : BERRIES_TO_EVOLVE;
