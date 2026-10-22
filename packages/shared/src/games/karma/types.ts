import type { Card } from './cards';
import type { KarmaMode } from './rules';

export const HAND_SIZE = 3;
export const BIG_HAND_SIZE = 4;
export const SLOTS = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export type KarmaPhase = 'swap' | 'play' | 'pick' | 'over';

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
  /** "3 ate 8": a 3 repeated the 8 beneath it (the rule, and the 8 really was there). */
  echoed: boolean;
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
  mode: KarmaMode;
  /** Extra rules in force in this game. */
  rules: string[];
  /** Party mode, round 2 and later, before the cards are dealt: the last winner sets the rules. */
  pick: KarmaPick | null;
  /** 1 for the first game of a room, then one more for every game after it. */
  round: number;
  /** Direction of play: 1 = clockwise (up the seat order), -1 = counter clockwise (jokers turn it around). */
  direction: 1 | -1;
  /**
   * Fast reload: the player to move has just drawn a card of the rank they played and may play
   * it before the turn passes (only cards of `rank`, or skip). `skips` = 8s played so far this turn.
   */
  reload: { rank: number; skips: number } | null;
}

export interface KarmaPick {
  playerId: string;
  choices: string[];
}

export type KarmaMove =
  | { type: 'swap'; hand: Card; up: number }
  | { type: 'ready' }
  | { type: 'play'; cards: Card[] }
  | { type: 'playDown'; index: number }
  | { type: 'pickup' }
  /** Fast reload: pass on playing a drawn matching card; the turn moves on. */
  | { type: 'skipReload' }
  /** Phase `pick`: the picker switches one rule on or off (everybody sees it live). */
  | { type: 'toggleRule'; rule: string }
  /** Phase `pick`: the picker is done; the cards are dealt and the swap phase starts. */
  | { type: 'confirmRules' };

export interface KarmaOptions {
  mode: KarmaMode;
  /** Rules carried over from earlier games of the room (party mode); set by the server. */
  rules: string[];
  /** Which game of the room this is (set by `nextOptions`); from 2 on, party mode lets the last winner pick. */
  round: number;
  /** The winner of the previous game, who picks the rules of this one (party mode, round 2+). */
  pickerId?: string;
}

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

/** Once the game is decided, what the player who is left holds is shown to everyone. */
export interface KarmaLeftovers {
  playerId: string;
  hand: Card[];
  /** The real face-down cards (null = already played). */
  faceDown: (Card | null)[];
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
  mode: KarmaMode;
  rules: string[];
  pick: KarmaPick | null;
  round: number;
  /** 1 = clockwise, -1 = counter clockwise. */
  direction: 1 | -1;
  /** Fast reload: only cards of this rank may be played now (or skip). */
  reload: { rank: number } | null;
  /** The loser's remaining cards, only once the finish order is complete (never during play). */
  leftovers: KarmaLeftovers | null;
}
