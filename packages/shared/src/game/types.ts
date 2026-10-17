import type { z } from 'zod';
import type { Rng } from './rng';

export type PlayerId = string;

export interface GamePlayer {
  id: PlayerId;
  nickname: string;
  avatar: string;
}

export type MoveValidation = { ok: true } | { ok: false; error: string };

export interface AutoMove<Move> {
  move: Move;
  /** True when this move completes the player's turn. */
  endsTurn: boolean;
}

export interface RankedPlayer {
  playerId: PlayerId;
  score: number;
  /** 1-based; tied players share a rank (1, 1, 3). */
  rank: number;
}

export interface GameResults {
  rankings: RankedPlayer[];
}

/**
 * The contract every game implements. All functions are pure and deterministic given the
 * injected Rng; states are treated as immutable (applyMove returns a new state).
 * The server/room code only ever talks to this interface.
 */
export interface GameDefinition<State, Move, Options, PlayerView = State> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** Validates room-level game options sent by the host. */
  optionsSchema: z.ZodType<Options, z.ZodTypeDef, unknown>;
  defaultOptions: Options;
  /** Validates the wire shape of a move; rules are checked by validateMove. */
  moveSchema: z.ZodType<Move, z.ZodTypeDef, unknown>;

  createInitialState(players: GamePlayer[], options: Options, rng: Rng): State;
  validateMove(state: State, playerId: PlayerId, move: Move): MoveValidation;
  /** Assumes nothing: throws if the move is invalid. */
  applyMove(state: State, playerId: PlayerId, move: Move, rng: Rng): State;
  /** What this player may see (hides private information). */
  getPlayerView(state: State, playerId: PlayerId): PlayerView;
  /** Players who may move right now (empty when the game is over). */
  getCurrentPlayers(state: State): PlayerId[];
  isGameOver(state: State): boolean;
  getResults(state: State): GameResults;
  /**
   * A reasonable move for a player who timed out or is absent. The server applies it and, while
   * `endsTurn` is false, calls it again after a short pause (so others can follow along).
   */
  autoMove?(state: State, playerId: PlayerId, rng: Rng): AutoMove<Move>;
  /**
   * The game can be played against computer players. They are real seats driven by `autoMove`, so
   * set this only when `autoMove` plays a reasonable game (not just "any legal move").
   */
  supportsBots?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameDefinition = GameDefinition<any, any, any, any>;
