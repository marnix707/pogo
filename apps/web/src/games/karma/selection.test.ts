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

  it('deselects only the tapped card of a selected set, even on a fast double tap (never plays)', () => {
    const all = [c(9), c(9, 1), c(9, 2)];
    expect(planTap({ zoneCards: hand, selected: all, card: c(9, 1), fast: false })).toEqual({
      type: 'select',
      cards: [c(9), c(9, 2)],
    });
    expect(planTap({ zoneCards: hand, selected: all, card: c(9), fast: true })).toEqual({
      type: 'select',
      cards: [c(9, 1), c(9, 2)],
    });
  });

  it('tapping a deselected card of a partly selected set adds it back; the last one off clears', () => {
    expect(
      planTap({ zoneCards: hand, selected: [c(9), c(9, 2)], card: c(9, 1), fast: false }),
    ).toEqual({ type: 'select', cards: [c(9), c(9, 2), c(9, 1)] });
    expect(planTap({ zoneCards: hand, selected: [c(9)], card: c(9), fast: false })).toEqual({
      type: 'select',
      cards: [],
    });
  });

  it('four of a kind: tap selects all four, a fast double tap plays them (instant burn)', () => {
    const quad = [c(6), c(6, 1), c(6, 2), c(6, 3)];
    const zone = [c(4), ...quad];
    expect(planTap({ zoneCards: zone, selected: [], card: c(6, 2), fast: false })).toEqual({
      type: 'select',
      cards: quad,
    });
    expect(planTap({ zoneCards: zone, selected: quad, card: c(6, 2), fast: true })).toEqual({
      type: 'play',
      cards: quad,
    });
    // a slow tap on a selected one still just drops that card
    expect(planTap({ zoneCards: zone, selected: quad, card: c(6, 2), fast: false })).toEqual({
      type: 'select',
      cards: [c(6), c(6, 1), c(6, 3)],
    });
  });

  it('two or three of a kind never play on a double tap (select mode only)', () => {
    const triple = [c(6), c(6, 1), c(6, 2)];
    expect(planTap({ zoneCards: triple, selected: triple, card: c(6), fast: true }).type).toBe(
      'select',
    );
  });

  it('selects a single card, deselects it on a slow second tap, plays it on a fast one', () => {
    expect(planTap({ zoneCards: hand, selected: [], card: c(5), fast: false })).toEqual({
      type: 'select',
      cards: [c(5)],
    });
    expect(planTap({ zoneCards: hand, selected: [c(5)], card: c(5), fast: false })).toEqual({
      type: 'select',
      cards: [],
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
