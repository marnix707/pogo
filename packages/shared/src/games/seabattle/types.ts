import type { PlayerId } from '../../game/types';
import type { Ship, ShipKind } from './fleet';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;

/** A shot that has been fired at a board. */
export interface Shot {
  x: number;
  y: number;
  hit: boolean;
}

export type SeaBattleMove =
  /** Placing is done: here is the fleet (sent once; the placing itself happens on the device). */
  { type: 'ready'; ships: Ship[] } | { type: 'fire'; x: number; y: number };

export type SeaBattleOptions = Record<string, never>;

export interface SeaBattleEvent {
  seq: number;
  by: PlayerId;
  x: number;
  y: number;
  result: 'miss' | 'hit' | 'sunk';
  /** The ship that went down. */
  sunk?: ShipKind;
  /** This shot ended the game. */
  win: boolean;
}

export interface SeaBattlePlayer {
  id: PlayerId;
  /** Empty until the player is ready. */
  ships: Ship[];
  ready: boolean;
  /** Shots fired AT this player's board, in order. */
  incoming: Shot[];
}

export interface SeaBattleState {
  phase: 'place' | 'play' | 'over';
  players: [SeaBattlePlayer, SeaBattlePlayer];
  /** Whose turn it is (play phase). */
  turn: PlayerId;
  /** Who starts: decided by the coin flip the clients animate. */
  first: PlayerId;
  winner: PlayerId | null;
  shotCount: number;
  lastEvent: SeaBattleEvent | null;
}

export interface SeaBattleView {
  phase: SeaBattleState['phase'];
  me: PlayerId;
  opponent: PlayerId;
  turn: PlayerId;
  first: PlayerId;
  winner: PlayerId | null;
  /** Who has pressed Ready while placing. */
  ready: Record<PlayerId, boolean>;
  /** My fleet once I am ready (before that the device holds it). */
  myShips: Ship[];
  /** Shots the opponent fired at me. */
  incoming: Shot[];
  /** Shots I fired at the opponent. */
  outgoing: Shot[];
  /** Opponent ships I have sunk (full detail). */
  sunk: Ship[];
  /** When the game is over: the opponent's ships that were still afloat (the radar shows them). */
  revealed: Ship[];
  lastEvent: SeaBattleEvent | null;
  shotCount: number;
}
