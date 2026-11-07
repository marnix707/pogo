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
  /** Rainbow Road: three players each own one space of a three-space street and you land on the free third. */
  rainbowRoad: boolean;
  /** Special wheel: the 4th roll after three sixes (and a fortunate-wheel card) spins a wheel with $50 and jail on it. */
  specialWheel: boolean;
  /** Free Froggo: the other players may pay a jailed player's bail (all of them, or nobody does). */
  freeFroggo: boolean;
}

export interface BankruptPlayer {
  id: PlayerId;
  /** Index into `PLAYER_COLOURS`: the order the players joined the room (the host first), whatever the seat order. */
  colour: number;
  cash: number;
  /** Index of the space the token stands on. */
  pos: number;
  /** Turns left in jail (0 = free). */
  jail: number;
  bankrupt: boolean;
  /** A computer player: it never trades. */
  bot: boolean;
  /** A fortunate-wheel card is waiting: the next roll spins the special wheel. */
  wheel: boolean;
  /** When the player went bankrupt (a later number = lasted longer), 0 while playing. */
  outAt: number;
}

/** The Free Froggo vote: every other player is asked to pay the bail of `subject`, who sits in jail. */
export interface Bail {
  subject: PlayerId;
  /** What each of the others pays (to the bank) if they all say yes. */
  amount: number;
  voters: PlayerId[];
  /** Who has said yes so far (one no ends the vote at once). */
  accepted: PlayerId[];
}

export interface Holding {
  owner: PlayerId;
  /** 0-3 buildings (properties only). */
  level: number;
}

export interface Auction {
  tile: string;
  /** The lowest opening bid: 70 % of the price. */
  min: number;
  high: { player: PlayerId; amount: number } | null;
  /** Players who stepped out. */
  passed: PlayerId[];
  /** Whose turn it is to bid or step out (one at a time, in seat order, the mover last). */
  turn: PlayerId;
  /** The highest amount each player has bid so far. */
  bids: Record<PlayerId, number>;
}

/**
 * The trade on the Auction corner. `pick`: the mover chooses one of their spaces (or cancels). `offers`: every other
 * player offers one of theirs for it, or passes (one clock for everybody). `choose`: the mover takes one offer
 * (or none).
 */
export interface Trade {
  by: PlayerId;
  stage: 'pick' | 'offers' | 'choose';
  /** The mover's space on offer. */
  give: string | null;
  /** The other players' answers: the space they offer, or null = passed. A player who has not answered is absent. */
  offers: Record<PlayerId, string | null>;
}

export type BankruptPhase =
  /** The mover may build / sell, then rolls. */
  | 'roll'
  /** The mover landed on a free space and must buy it or let it go to auction. */
  | 'buy'
  /** The mover's landing is dealt with; the turn then ends by itself. */
  | 'after'
  /** The mover was just sent to jail: pay the fee now or stay (nothing else can get them out). */
  | 'jailAsk'
  | 'auction'
  /** The mover stands on the Auction corner: a trade of spaces between players (see `Trade`). */
  | 'trade'
  /** A jailed player's turn has come and the others are asked to pay the bail (see `Bail`). */
  | 'bail'
  | 'over';

export type CardKind =
  'wheel' | 'gain' | 'pay' | 'birthday' | 'party' | 'travel' | 'repair' | 'jail';

export type BankruptEvent =
  /**
   * A roll: `dice` is the number rolled (0 when the special wheel gave $50 or jail). `wheel` is set when the roll was
   * the special wheel: which slice it stopped on (`idx` in `SPECIAL_SLICES`), what is on it, and where the frog
   * stood (for the police car).
   */
  | {
      k: 'roll';
      by: PlayerId;
      dice: number;
      wheel?: { idx: number; slice: string; from: number };
    }
  | { k: 'move'; by: PlayerId; from: number; to: number; passedStart: boolean }
  | { k: 'rent'; by: PlayerId; to: PlayerId; tile: string; amount: number }
  | { k: 'buy'; by: PlayerId; tile: string; price: number }
  /** A luck card was drawn; `kind` picks its icon. The effect follows as `pay` / `move` / `jail` events. */
  | { k: 'card'; by: PlayerId; text: string; kind: CardKind }
  /** Money moved because of a card (null = the bank). */
  | { k: 'pay'; from: PlayerId | null; to: PlayerId | null; amount: number }
  | { k: 'jail'; by: PlayerId }
  /** A jailed player's turn is skipped; `left` turns remain. */
  | { k: 'jailSkip'; by: PlayerId; left: number }
  /** Out of jail; `fee` when the player paid to get out. */
  | { k: 'free'; by: PlayerId; fee?: number }
  | { k: 'salary'; by: PlayerId; amount: number }
  /** A building was bought (`amount` > 0, what it cost) or sold (`amount` < 0, what came back). */
  | { k: 'build'; by: PlayerId; tile: string; level: number; amount: number }
  | { k: 'sold'; by: PlayerId; tile: string; amount: number }
  | { k: 'auction'; tile: string; winner: PlayerId | null; amount: number }
  /** A trade went through: `by` gave `give`, `with` gave `take`, both got `bonus` from the bank. */
  | { k: 'trade'; by: PlayerId; with: PlayerId; give: string; take: string; bonus: number }
  | { k: 'tradeEnd'; by: PlayerId }
  /** The mover stood on the Auction corner but nobody can trade (no spaces to swap, or only computers to trade with). */
  | { k: 'tradeNone'; by: PlayerId }
  /** Rainbow Road: the street `tiles` was sold back to the bank; each owner got `amount` for their space. */
  | {
      k: 'rainbow';
      by: PlayerId;
      tiles: string[];
      payouts: { player: PlayerId; tile: string; amount: number }[];
    }
  /** Free Froggo: everybody paid `amount` to the bank and `subject` is out of jail. */
  | { k: 'bail'; subject: PlayerId; payers: PlayerId[]; amount: number }
  /** Free Froggo: `by` refused to pay, so `subject` stays in jail. */
  | { k: 'bailRefused'; by: PlayerId; subject: PlayerId }
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
  /** The last roll, for the die on screen. */
  dice: number | null;
  auction: Auction | null;
  /** The trade going on (the mover stands on the Auction corner), or null. */
  trade: Trade | null;
  /** The Free Froggo vote going on, or null. */
  bail: Bail | null;
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
  | { type: 'payJail' }
  /** In jail: do not pay, stay for the rest of the sentence. */
  | { type: 'wait' }
  | { type: 'build'; tile: string }
  | { type: 'sellBuilding'; tile: string }
  | { type: 'sellProperty'; tile: string }
  | { type: 'bid'; amount: number }
  | { type: 'passBid' }
  /** Trade: the mover offers one of their spaces. */
  | { type: 'tradePick'; tile: string }
  /** Trade: another player offers one of theirs for it. */
  | { type: 'tradeOffer'; tile: string }
  | { type: 'tradePass' }
  /** Trade: the mover takes the offer of `from`. */
  | { type: 'tradeAccept'; from: PlayerId }
  /** Trade: the mover cancels (before or after the offers). */
  | { type: 'tradeCancel' }
  /** Rainbow Road: sell the whole street back to the bank (instead of buying the space you landed on). */
  | { type: 'rainbow' }
  /** Free Froggo: pay the bail of the jailed player. */
  | { type: 'bailPay' }
  /** Free Froggo: refuse; the vote is off. */
  | { type: 'bailRefuse' };

/** Everything is public in this game, so the view is the state. */
export type BankruptView = BankruptState;
