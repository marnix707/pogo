import { karma } from '@pogo/shared';

/** Two taps on the same card within this many ms are a double tap. */
export const DOUBLE_TAP_MS = 350;

export type TapPlan =
  { type: 'select'; cards: number[] } | { type: 'deselect' } | { type: 'play'; cards: number[] };

/**
 * What a tap on a card of the active zone (hand, or the face-up cards) does.
 *
 * - A rank you hold several of: tapping selects every one of them. No double tap here (you may
 *   have many cards and could never double-tap in time); tapping again deselects the set.
 *   You then press Play.
 * - A rank you hold once: tap selects it, a quick second tap plays it, a slow one deselects it.
 */
export function planTap(opts: {
  zoneCards: readonly number[];
  selected: readonly number[];
  card: number;
  fast: boolean;
}): TapPlan {
  const { zoneCards, selected, card, fast } = opts;
  const sameRank = zoneCards.filter((c) => karma.rankOf(c) === karma.rankOf(card));
  if (sameRank.length > 1) {
    return selected.includes(card) ? { type: 'deselect' } : { type: 'select', cards: sameRank };
  }
  if (fast) return { type: 'play', cards: [card] };
  return selected.includes(card) ? { type: 'deselect' } : { type: 'select', cards: [card] };
}
