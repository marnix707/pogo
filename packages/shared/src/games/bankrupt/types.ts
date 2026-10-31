import type { PlayerId } from '../../game/types';
import type { BoardConfig } from './config';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Net worth the host can pick as the goal (0 = play to the end). */
export const TARGETS = [3000, 5000, 7000, 10000, 0] as const;
/** Rounds the host can pick as the limit (0 = no limit). */
export const TURN_LIMITS = [20, 30, 45, 0] as const;

export interface BankruptOptions {
  /** First to reach this net worth wins; 0 = no target. */
  target: number;
  /** After this many rounds the richest player wins; 0 = no limit. */
  turns: number;
  /** A space somebody does not buy goes to auction (on), or just stays free (off). */
  auctionOnDecline: boolean;
}

export interface BankruptPlayer {
  id: PlayerId;
  cash: number;
  /** Index of the space the token stands on. */
  pos: number;
  /** Turns left in jail (0 = free). */
  jail: number;
  bankrupt: boolean;
  /** When the player went bankrupt (a later number = lasted longer), 0 while playing. */
  outAt: number;
}

export interface Holding {
  owner: PlayerId;
  /** 0-3 buildings (properties only). */
  level: number;
}

export interface Auction {
  tile: string;
  /** The player who sells it, or null when the bank sells a space nobody bought. */
  seller: PlayerId | null;
  high: { player: PlayerId; amount: number } | null;
  /** Players who stepped out. */
  passed: PlayerId[];
}

export type BankruptPhase =
  /** The mover may build / sell, then rolls (or pays to leave jail / waits in jail). */
  | 'roll'
  /** The mover landed on a free space and must buy it or let it go to auction. */
  | 'buy'
  /** The mover stands on the Auction corner and may auction a space (or skip); every other turn ends by itself. */
  | 'after'
  | 'auction'
  | 'over';

export type BankruptEvent =
  | { k: 'roll'; by: PlayerId; dice: number }
  | { k: 'move'; by: PlayerId; from: number; to: number; passedStart: boolean }
  | { k: 'rent'; by: PlayerId; to: PlayerId; tile: string; amount: number }
  | { k: 'buy'; by: PlayerId; tile: string; price: number }
  | { k: 'card'; by: PlayerId; text: string }
  | { k: 'jail'; by: PlayerId }
  | { k: 'free'; by: PlayerId }
  | { k: 'salary'; by: PlayerId; amount: number }
  | { k: 'build'; by: PlayerId; tile: string; level: number }
  | { k: 'sold'; by: PlayerId; tile: string; amount: number }
  /** `bonus`: what the seller and the winner each got from the bank when a player sold to a player. */
  | {
      k: 'auction';
      tile: string;
      winner: PlayerId | null;
      seller: PlayerId | null;
      amount: number;
      bonus: number;
    }
  | { k: 'bankrupt'; by: PlayerId };

export interface BankruptState {
  board: BoardConfig;
  options: BankruptOptions;
  players: BankruptPlayer[];
  /** Spaces somebody owns, by space id. */
  owned: Record<string, Holding>;
  /** Index (into `players`) of the player whose turn it is. */
  turn: number;
  /** 1-based round; a round is everybody's turn. */
  round: number;
  phase: BankruptPhase;
  /** Sixes rolled in a row this turn (a six rolls again, with no penalty). */
  sixes: number;
  /** The last roll, for the utility rent and the die on screen. */
  dice: number | null;
  /** The mover stands on the Auction corner and may auction one of their spaces. */
  auctionRight: boolean;
  auction: Auction | null;
  /** What the last move did, in order (the screen replays it). */
  events: BankruptEvent[];
  /** Counts moves, so the screen can tell a new event list from the last one. */
  seq: number;
  winner: PlayerId | null;
}

export type BankruptMove =
  | { type: 'roll' }
  | { type: 'buy' }
  /** Let a free space go to auction. */
  | { type: 'decline' }
  | { type: 'endTurn' }
  | { type: 'payJail' }
  /** Sit out a turn in jail. */
  | { type: 'wait' }
  | { type: 'build'; tile: string }
  | { type: 'sellBuilding'; tile: string }
  | { type: 'sellProperty'; tile: string }
  | { type: 'startAuction'; tile: string }
  | { type: 'bid'; amount: number }
  | { type: 'passBid' }
  | { type: 'cancelAuction' };

/** Everything is public in this game, so the view is the state. */
export type BankruptView = BankruptState;
