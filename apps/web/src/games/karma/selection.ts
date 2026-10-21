import { karma } from '@pogo/shared';

export type TapPlan =
  /** The new selection (empty = nothing selected). */
  { type: 'select'; cards: number[] } | { type: 'play'; cards: number[] };

/**
 * What a tap on a card of the active zone (hand, or the face-up cards) does. There is no timing:
 *
 * - A card you hold once: the first tap selects it, tapping the selected card again plays it.
 * - A rank you hold two, three or four of: tapping selects every one of them. Tapping one of the
 *   selected cards again deselects just that card (tap it once more to add it back). Sets are
 *   always played with the Play button.
 * - Tapping another rank replaces the selection; tapping the table clears it.
 */
export function planTap(opts: {
  zoneCards: readonly number[];
  selected: readonly number[];
  card: number;
}): TapPlan {
  const { zoneCards, selected, card } = opts;
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
  if (selected.includes(card)) return { type: 'play', cards: [card] };
  return { type: 'select', cards: [card] };
}
