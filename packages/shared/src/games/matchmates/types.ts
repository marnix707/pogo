import type { PlayerId } from '../../game/types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;

export const COLS = 7;
export const ROWS = 5;
export const CELLS = COLS * ROWS;

export const ELEMENTS = ['fire', 'water', 'earth', 'electric', 'psychic'] as const;
export type Element = (typeof ELEMENTS)[number];

export const STAGES = ['stadium', 'forest', 'lava', 'frost', 'reactor', 'swamp'] as const;
export type StageId = (typeof STAGES)[number];

/** What sits on a board square. `mystery` only exists in views: the real tile is hidden from the players. */
export type TileKind = Element | 'berry' | 'bomb' | 'mystery';

export interface MateCell {
  k: TileKind;
  /** Frozen (Frost Lake): cannot be swapped until after the next move. */
  frozen?: true;
  /** Bomb countdown (Reactor): explodes in a cross when it reaches 0. */
  fuse?: number;
  /** Covered by a "?" tile (Swamp). The state keeps the real tile; the view hides it. */
  hidden?: true;
}

export type MatesMove =
  /** Draft: one pet, in turn (first player, then the second twice, then the first again). */
  | { type: 'draft'; element: Element }
  /** Once all four pets are picked: the arena you would like ('random' = leave it to the dice) and ready. */
  | { type: 'confirm'; stage: StageId | 'random' }
  | { type: 'swap'; a: number; b: number }
  | { type: 'evolve'; slot: number }
  | { type: 'boost'; slot: number };

/** Starting hit points a room can pick (the first is the default). */
export const HP_CHOICES = [100, 125, 150, 200] as const;

export interface MatesOptions {
  /** Starting hit points of both pets' owners (one of HP_CHOICES). */
  hp: number;
}

export interface MateMonster {
  element: Element;
  evolved: boolean;
  mana: number;
}

export interface MatePlayer {
  id: PlayerId;
  hp: number;
  maxHp: number;
  monsters: MateMonster[];
  berries: number;
  confirmed: boolean;
  /** The arena this player asked for (hidden from the opponent until the coin is flipped). */
  stagePick: StageId | 'random' | null;
  /** Moves added to (+) or taken from (-) this player's next turn. */
  moveDelta: number;
}

/** One cascade step the client plays: the squares that went, then the board after gravity and refill. */
export interface MateStep {
  cleared: number[];
  board: MateCell[];
  /** A bomb went off. */
  bomb?: true;
  /** An ability changed these squares. */
  changed?: number[];
  /** An ability cleared these squares (a column, a block). */
  ability?: true;
  /** No move was left: a fresh board. */
  shuffled?: true;
}

export interface MateFire {
  /** The attack plays after this many steps. */
  step: number;
  owner: PlayerId;
  slot: number;
  element: Element;
  evolved: boolean;
  damage: number;
  /** Hit points the owner got back. */
  heal: number;
  /** Mana taken from each of the opponent's monsters (psychic). */
  drain?: number;
  /** Squares the attack cleared (fire, electric) or turned into water (water). */
  cells?: number[];
}

export interface MateEvent {
  seq: number;
  by: PlayerId;
  kind: 'swap' | 'evolve' | 'boost';
  a?: number;
  b?: number;
  slot?: number;
  /** The board right after the swap, before anything cleared. */
  swapped?: MateCell[];
  steps: MateStep[];
  fires: MateFire[];
  /** Longest line of the move. */
  longest: number;
  /** A swap that made no match: the tiles stay swapped and the move is spent. */
  noMatch: boolean;
  /** Hit points the mover got back from a line of 5 or more. */
  heal: number;
  extraMove: boolean;
  win: boolean;
}

export interface MatesState {
  phase: 'pick' | 'play' | 'over';
  players: [MatePlayer, MatePlayer];
  options: MatesOptions;
  stage: StageId;
  board: MateCell[];
  /** Who plays first (the loser of the coin flip). */
  first: PlayerId;
  /** Who drafts first. */
  draftFirst: PlayerId;
  coinWinner: PlayerId | null;
  turn: PlayerId;
  movesLeft: number;
  winner: PlayerId | null;
  moveCount: number;
  lastEvent: MateEvent | null;
}

export interface MatesView {
  phase: MatesState['phase'];
  me: PlayerId;
  opponent: PlayerId;
  /** My side first, then the opponent. The opponent's arena choice stays hidden until the coin is flipped. */
  players: MatePlayer[];
  /** Who has confirmed (after the draft). */
  confirmed: Record<PlayerId, boolean>;
  /** Whose draft pick it is, or null when the draft is over. */
  drafter: PlayerId | null;
  /** Who won the coin flip: their arena is used, they play second and start with extra hit points. */
  coinWinner: PlayerId | null;
  stage: StageId | null;
  options: MatesOptions;
  board: MateCell[];
  first: PlayerId;
  turn: PlayerId;
  movesLeft: number;
  winner: PlayerId | null;
  moveCount: number;
  lastEvent: MateEvent | null;
}
