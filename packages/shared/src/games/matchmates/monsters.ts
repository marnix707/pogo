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
  /** Water: tiles turned into water. Earth: berries gained. Electric: opponent moves lost. Psychic: berries and mana stolen. */
  power: [number, number];
}

export const BERRIES_TO_EVOLVE = 4;
export const BOOST_MANA = 4;

export const MONSTERS: Readonly<Record<Element, MonsterSpec>> = {
  fire: {
    element: 'fire',
    names: ['Embit', 'Blazemaw'],
    cost: 6,
    damage: [10, 20],
    ability: 'Ember Burst: pure fire damage.',
    power: [0, 0],
  },
  water: {
    element: 'water',
    names: ['Puddlo', 'Tidalurk'],
    cost: 7,
    damage: [10, 20],
    ability: 'Tidal Splash: damage and turns random tiles into water.',
    power: [3, 4],
  },
  earth: {
    element: 'earth',
    names: ['Sprigg', 'Thornback'],
    cost: 7,
    damage: [10, 20],
    ability: 'Harvest: damage and grows berries for you.',
    power: [2, 4],
  },
  electric: {
    element: 'electric',
    names: ['Zappip', 'Voltusk'],
    cost: 6,
    damage: [10, 20],
    ability: 'Overload: damage, and the opponent has one move less next turn.',
    power: [1, 1],
  },
  psychic: {
    element: 'psychic',
    names: ['Mindle', 'Oracull'],
    cost: 6,
    damage: [10, 15],
    ability: 'Pickpocket: damage, and steals berries and mana.',
    power: [1, 2],
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
