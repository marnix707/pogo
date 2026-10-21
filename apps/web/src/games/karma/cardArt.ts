import { karma } from '@pogo/shared';

// All 52 faces + the back, as fingerprinted URLs: "AS.svg", "10H.svg", "back.svg".
const files = import.meta.glob('../../assets/sprites/cards/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const byName = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

/** Card suit index (`karma.suitOf`: 0 spades, 1 hearts, 2 diamonds, 3 clubs) to the file letter. */
const SUIT_LETTER = ['S', 'H', 'D', 'C'] as const;
const RANK_NAME: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const cardBackUrl = byName['back']!;

/** The artwork of a card number (0-51). */
export function cardFaceUrl(card: number): string {
  const rank = karma.rankOf(card);
  return byName[`${RANK_NAME[rank] ?? rank}${SUIT_LETTER[karma.suitOf(card)]}`]!;
}
