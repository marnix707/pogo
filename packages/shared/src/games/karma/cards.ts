import type { Rng } from '../../game/rng';

/**
 * A card is a number 0-51: suit = floor(c / 13), rank = c % 13 + 2 (2..10, J=11, Q=12, K=13, A=14).
 * With the "Joker returns" rule two jokers (52 and 53, rank 15) join the deck.
 */
export type Card = number;

export const DECK_SIZE = 52;
export const ACE = 14;
export const JOKER_RANK = 15;
export const FIRST_JOKER = DECK_SIZE;
export const JOKER_COUNT = 2;
export const isJoker = (card: Card): boolean => card >= FIRST_JOKER;

export const rankOf = (card: Card): number => (isJoker(card) ? JOKER_RANK : (card % 13) + 2);
export const suitOf = (card: Card): number => Math.floor(card / 13);

export const RANK_LABEL: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '🃏',
};

/** Spades, hearts, diamonds, clubs. */
export const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'] as const;
export const isRedSuit = (card: Card): boolean => suitOf(card) === 1 || suitOf(card) === 2;

export const cardLabel = (card: Card): string =>
  isJoker(card) ? 'Joker' : `${RANK_LABEL[rankOf(card)]}${SUIT_SYMBOL[suitOf(card)]}`;

/** A freshly shuffled deck (Fisher-Yates driven by the injected Rng). */
export function shuffledDeck(rng: Rng, jokers = false): Card[] {
  const deck = Array.from({ length: DECK_SIZE + (jokers ? JOKER_COUNT : 0) }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card];
  }
  return deck;
}
