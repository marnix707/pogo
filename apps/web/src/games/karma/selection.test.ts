import { describe, expect, it } from 'vitest';
import { planTap } from './selection';

// card = (rank - 2) + 13 * suit
const c = (rank: number, suit = 0) => suit * 13 + (rank - 2);

describe('planTap', () => {
  const hand = [c(5), c(9), c(9, 1), c(9, 2), c(12)];

  it('selects every card of a rank you hold several of', () => {
    expect(planTap({ zoneCards: hand, selected: [], card: c(9, 1), fast: false })).toEqual({
      type: 'select',
      cards: [c(9), c(9, 1), c(9, 2)],
    });
  });

  it('never plays on a double tap when you hold duplicates: the second tap deselects them', () => {
    expect(
      planTap({ zoneCards: hand, selected: [c(9), c(9, 1), c(9, 2)], card: c(9), fast: true }),
    ).toEqual({
      type: 'deselect',
    });
  });

  it('selects a single card, deselects it on a slow second tap, plays it on a fast one', () => {
    expect(planTap({ zoneCards: hand, selected: [], card: c(5), fast: false })).toEqual({
      type: 'select',
      cards: [c(5)],
    });
    expect(planTap({ zoneCards: hand, selected: [c(5)], card: c(5), fast: false })).toEqual({
      type: 'deselect',
    });
    expect(planTap({ zoneCards: hand, selected: [c(5)], card: c(5), fast: true })).toEqual({
      type: 'play',
      cards: [c(5)],
    });
  });

  it('tapping another rank replaces the selection', () => {
    expect(planTap({ zoneCards: hand, selected: [c(5)], card: c(12), fast: false })).toEqual({
      type: 'select',
      cards: [c(12)],
    });
  });
});
