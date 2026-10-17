import { karma } from '@pogo/shared';

/** Two taps on the same card within this many ms are a double tap. */
export const DOUBLE_TAP_MS = 350;

export type TapPlan =
  /** The new selection (empty = nothing selected). */
  { type: 'select'; cards: number[] } | { type: 'play'; cards: number[] };

/**
 * What a tap on a card of the active zone (hand, or the face-up cards) does.
 *
 * - A rank you hold several of: tapping selects every one of them. Tapping one of the selected
 *   cards again deselects just that card (tap it once more to add it back). No double tap here
 *   (with many cards you could never be quick enough); press Play.
 * - A rank you hold once: tap selects it, a quick second tap plays it, a slow one deselects it.
 */
export function planTap(opts: {
  zoneCards: readonly number[];
  selected: readonly number[];
  card: number;
  fast: boolean;
}): TapPlan {
  const { zoneCards, selected, card, fast } = opts;
  const rank = karma.rankOf(card);
  const sameRank = zoneCards.filter((c) => karma.rankOf(c) === rank);
  if (sameRank.length > 1) {
    if (selected.includes(card))
      return { type: 'select', cards: selected.filter((c) => c !== card) };
    const selectedSame = selected.filter((c) => karma.rankOf(c) === rank);
    return {
      type: 'select',
      cards: selectedSame.length > 0 ? [...selectedSame, card] : sameRank,
    };
  }
  if (fast) return { type: 'play', cards: [card] };
  return { type: 'select', cards: selected.includes(card) ? [] : [card] };
}
