import type { Rng } from '../../game/rng';

/**
 * A card is a number 0-107.
 *  - 0-99: four colours of 25 cards: colour = floor(c / 25) (0 red, 1 yellow, 2 green, 3 blue); inside a
 *    colour k = c % 25: 0 = the single "0", 1-9 and 10-18 = the numbers 1-9 twice, 19-20 skip,
 *    21-22 reverse, 23-24 draw two.
 *  - 100-103: wild, 104-107: wild draw four.
 */
export type Card = number;

export const DECK_SIZE = 108;
export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = 0 | 1 | 2 | 3;
export const COLOR_NAME: Record<Color, string> = { 0: 'Red', 1: 'Yellow', 2: 'Green', 3: 'Blue' };

export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface CardInfo {
  kind: CardKind;
  /** 0-3 for coloured cards, null for wilds. */
  color: Color | null;
  /** The digit of a number card. */
  value: number | null;
}

export function cardInfo(card: Card): CardInfo {
  if (card >= 104) return { kind: 'wild4', color: null, value: null };
  if (card >= 100) return { kind: 'wild', color: null, value: null };
  const color = Math.floor(card / 25) as Color;
  const k = card % 25;
  if (k === 0) return { kind: 'number', color, value: 0 };
  if (k <= 18) return { kind: 'number', color, value: ((k - 1) % 9) + 1 };
  if (k <= 20) return { kind: 'skip', color, value: null };
  if (k <= 22) return { kind: 'reverse', color, value: null };
  return { kind: 'draw2', color, value: null };
}

/** Everything that is not a plain number card. */
export const isSpecial = (card: Card): boolean => cardInfo(card).kind !== 'number';
export const isWild = (card: Card): boolean => card >= 100;

/** Points of a card left in a hand (ranks the losers). */
export function cardPoints(card: Card): number {
  const info = cardInfo(card);
  if (info.kind === 'number') return info.value ?? 0;
  return info.kind === 'wild' || info.kind === 'wild4' ? 50 : 20;
}

export function cardLabel(card: Card): string {
  const info = cardInfo(card);
  const color = info.color === null ? '' : `${COLOR_NAME[info.color]} `;
  switch (info.kind) {
    case 'number':
      return `${color}${info.value}`;
    case 'skip':
      return `${color}Skip`;
    case 'reverse':
      return `${color}Reverse`;
    case 'draw2':
      return `${color}Draw Two`;
    case 'wild':
      return 'Wild';
    case 'wild4':
      return 'Wild Draw Four';
  }
}

/** A freshly shuffled deck (Fisher-Yates driven by the injected Rng). */
export function shuffled(cards: Card[], rng: Rng): Card[] {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card];
  }
  return deck;
}

export const freshDeck = (rng: Rng): Card[] =>
  shuffled(
    Array.from({ length: DECK_SIZE }, (_, i) => i),
    rng,
  );

/**
 * May `card` be played on `top` (the card on the pile) while the colour in force is `color`?
 * Wild Draw Four only when the hand holds no card of that colour (the official rule; there is no
 * challenge in this game, so it is simply enforced).
 */
export function canPlayCard(card: Card, top: Card, color: Color, hand: readonly Card[]): boolean {
  const info = cardInfo(card);
  if (info.kind === 'wild') return true;
  if (info.kind === 'wild4') return !hand.some((c) => cardInfo(c).color === color);
  if (info.color === color) return true;
  const t = cardInfo(top);
  if (t.kind === 'wild' || t.kind === 'wild4') return false;
  return t.kind === info.kind && t.value === info.value;
}
