import type { Card } from './cards';

export const HAND_SIZE = 3;
export const SLOTS = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export type KarmaPhase = 'swap' | 'play' | 'over';

export interface KarmaPlayerState {
  id: string;
  hand: Card[];
  /** Three slots; null once the card has been played. */
  faceUp: (Card | null)[];
  faceDown: (Card | null)[];
  /** Swap phase: done swapping. */
  ready: boolean;
  /** No cards left (safe). */
  out: boolean;
}

/** What the latest move did; lets the UI narrate and animate it. */
export interface KarmaEvent {
  /** Increases with every move. */
  seq: number;
  playerId: string;
  kind: 'play' | 'blind' | 'pickup';
  /** Cards played (or the revealed face-down card). */
  cards: Card[];
  /** The pile was burned (a 10 or four of a kind). */
  burned: boolean;
  /** Cards taken into the hand (a pickup). */
  pickedUp: number;
  /** A face-down card turned out too low: it lies on the pile and its owner must pick the pile up. */
  failed: boolean;
  /** The player has no cards left. */
  out: boolean;
  /** Players whose turn was skipped by an 8 (in order). */
  skipped: string[];
}

export interface KarmaState {
  phase: KarmaPhase;
  players: KarmaPlayerState[];
  /** Draw pile; the top is the last element. */
  stock: Card[];
  /** The wastepile, oldest first; the top is the last element. */
  pile: Card[];
  /** Number of cards removed from play. */
  burned: number;
  /** Index of the player to move (play phase). */
  turn: number;
  /** Player ids in the order they ran out of cards; the last one is the loser. */
  finishOrder: string[];
  /** The current player flipped a too-low face-down card: picking up the pile is their only move. */
  mustPickUp: boolean;
  eventSeq: number;
  lastEvent: KarmaEvent | null;
}

export type KarmaMove =
  | { type: 'swap'; hand: Card; up: number }
  | { type: 'ready' }
  | { type: 'play'; cards: Card[] }
  | { type: 'playDown'; index: number }
  | { type: 'pickup' };

export type KarmaOptions = Record<string, never>;

/** What one player is allowed to know about a seat. */
export interface KarmaPlayerView {
  id: string;
  handCount: number;
  /** Only the viewer's own hand. */
  hand: Card[] | null;
  faceUp: (Card | null)[];
  /** true = a card is still there (its value is hidden from everyone, owner included). */
  faceDown: boolean[];
  ready: boolean;
  out: boolean;
}

export interface KarmaView {
  phase: KarmaPhase;
  players: KarmaPlayerView[];
  stockCount: number;
  pile: Card[];
  burned: number;
  turn: number;
  finishOrder: string[];
  mustPickUp: boolean;
  lastEvent: KarmaEvent | null;
}
