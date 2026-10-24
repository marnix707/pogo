import type { Card, Color } from './cards';

export const HAND_SIZE = 7;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface LastCardPlayerState {
  id: string;
  hand: Card[];
  /** Pressed UNO! while holding one card. Resets as soon as the hand has another size. */
  called: boolean;
}

/** What the latest move did; lets the UI narrate and animate it. */
export interface LastCardEvent {
  /** Increases with every move. */
  seq: number;
  playerId: string;
  kind: 'play' | 'draw' | 'pass' | 'uno' | 'callout';
  /** The card played (kind 'play'). */
  card: Card | null;
  /** The colour chosen with a wild (or the colour of the card). */
  color: Color | null;
  /** Cards the player took from the deck (kind 'draw': 1 or 0 when nothing was left). */
  drew: number;
  /** Who had to draw (a Draw Two / Wild Draw Four, or the player who was called out) and how many. */
  victim: { playerId: string; count: number } | null;
  /** Players whose turn was skipped (a skip, or the victim of a draw card). */
  skipped: string[];
  /** The direction of play was reversed by this move. */
  reversed: boolean;
  /** The move was played together with UNO! (or only called it). */
  uno: boolean;
  /** The player has no cards left. */
  out: boolean;
  /** The draw penalty waiting for the next player after this move (stacked Draw Two / Four). */
  pending: number;
}

export interface LastCardState {
  players: LastCardPlayerState[];
  /** Draw pile; the top is the last element. */
  stock: Card[];
  /** The discard pile, oldest first; the top is the last element. */
  pile: Card[];
  /** The colour in force (after a wild, the colour that was chosen). */
  color: Color;
  /** Index of the player to move. */
  turn: number;
  /** 1 = clockwise (up the seat order), -1 = counter clockwise. */
  direction: 1 | -1;
  /**
   * Cards the player to move must draw unless they answer with another Draw Two / Wild Draw Four
   * (which adds to it). 0 = no penalty waiting.
   */
  pending: number;
  /** The player to move has drawn this card and may play it or pass. */
  drawn: Card | null;
  winner: string | null;
  eventSeq: number;
  lastEvent: LastCardEvent | null;
  /** The latest UNO! call (kept apart from lastEvent: the next move must not hide the animation). */
  unoCall: { seq: number; playerId: string } | null;
  /**
   * The player who has just played down to one card without calling UNO!: until somebody draws, passes
   * or plays (the next player "starts their turn") they may still call it and the others may call them out.
   */
  callWindow: string | null;
  /** The latest call-out (kept apart from lastEvent like unoCall). */
  catchCall: { seq: number; byId: string; targetId: string } | null;
}

export type LastCardMove =
  | { type: 'play'; card: Card; color?: Color; uno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'uno' }
  | { type: 'callout'; target: string };

export type LastCardOptions = Record<string, never>;

export interface LastCardPlayerView {
  id: string;
  count: number;
  /** Pressed UNO! (only meaningful with one card left). */
  called: boolean;
}

export interface LastCardView {
  phase: 'play' | 'over';
  players: LastCardPlayerView[];
  /** My cards. */
  hand: Card[];
  top: Card;
  /** The last few discarded cards under the top one (for the stack on the table). */
  below: Card[];
  color: Color;
  stockCount: number;
  /** Index into `players` of the player to move. */
  turn: number;
  direction: 1 | -1;
  /** The draw penalty waiting for the player to move (see LastCardState.pending). */
  pending: number;
  /** I drew this card and may play it or pass. */
  drawn: Card | null;
  /** I have one card left and have not pressed UNO! yet. */
  mustCall: boolean;
  winner: string | null;
  lastEvent: LastCardEvent | null;
  unoCall: { seq: number; playerId: string } | null;
  /** Who can still call UNO! / be called out right now (see LastCardState.callWindow). */
  callWindow: string | null;
  catchCall: { seq: number; byId: string; targetId: string } | null;
}
