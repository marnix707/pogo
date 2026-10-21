import { describe, expect, it } from 'vitest';
import { planTap } from './selection';

// card = (rank - 2) + 13 * suit
const c = (rank: number, suit = 0) => suit * 13 + (rank - 2);

describe('planTap', () => {
  const hand = [c(5), c(9), c(9, 1), c(9, 2), c(12)];

  it('selects every card of a rank you hold several of', () => {
    expect(planTap({ zoneCards: hand, selected: [], card: c(9, 1) })).toEqual({
      type: 'select',
      cards: [c(9), c(9, 1), c(9, 2)],
    });
  });

  it('tapping a selected card of a set deselects just that card and never plays', () => {
    const all = [c(9), c(9, 1), c(9, 2)];
    expect(planTap({ zoneCards: hand, selected: all, card: c(9, 1) })).toEqual({
      type: 'select',
      cards: [c(9), c(9, 2)],
    });
  });

  it('tapping a deselected card of a partly selected set adds it back; the last one off clears', () => {
    expect(planTap({ zoneCards: hand, selected: [c(9), c(9, 2)], card: c(9, 1) })).toEqual({
      type: 'select',
      cards: [c(9), c(9, 2), c(9, 1)],
    });
    expect(planTap({ zoneCards: hand, selected: [c(9)], card: c(9) })).toEqual({
      type: 'select',
      cards: [],
    });
  });

  it('four of a kind is a set too: tap selects all four, the Play button plays them', () => {
    const quad = [c(6), c(6, 1), c(6, 2), c(6, 3)];
    const zone = [c(4), ...quad];
    expect(planTap({ zoneCards: zone, selected: [], card: c(6, 2) })).toEqual({
      type: 'select',
      cards: quad,
    });
    // tapping a selected one just drops that card (never plays)
    expect(planTap({ zoneCards: zone, selected: quad, card: c(6, 2) })).toEqual({
      type: 'select',
      cards: [c(6), c(6, 1), c(6, 3)],
    });
  });

  it('a card held once: tap selects it, tapping it again plays it (no timing)', () => {
    expect(planTap({ zoneCards: hand, selected: [], card: c(5) })).toEqual({
      type: 'select',
      cards: [c(5)],
    });
    expect(planTap({ zoneCards: hand, selected: [c(5)], card: c(5) })).toEqual({
      type: 'play',
      cards: [c(5)],
    });
  });

  it('tapping another rank replaces the selection', () => {
    expect(planTap({ zoneCards: hand, selected: [c(5)], card: c(12) })).toEqual({
      type: 'select',
      cards: [c(12)],
    });
  });
});
