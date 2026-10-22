import { describe, expect, it } from 'vitest';
import {
  MANY_ROWS_SCALE,
  MAX_VISIBLE,
  MIN_VISIBLE,
  WRAP_SCALE,
  handLayout,
  maxPerRow,
} from './handLayout';

const FONT = 18; // card = 90px wide

describe('handLayout', () => {
  it('keeps one row while every card shows at least the minimum', () => {
    const per = maxPerRow(390, FONT * 5);
    expect(handLayout(per, 390, FONT).rows).toBe(1);
    expect(handLayout(per + 1, 390, FONT).rows).toBe(2);
  });

  it('shows at least MIN_VISIBLE of every card, for any hand size and width', () => {
    for (const width of [280, 320, 360, 390, 430, 600, 900]) {
      for (let n = 1; n <= 52; n++) {
        const l = handLayout(n, width, FONT);
        const cardW = l.font * 5;
        expect(l.strip + 1e-6).toBeGreaterThanOrEqual(cardW * MIN_VISIBLE);
        // the fullest row fits inside the container
        expect(cardW + (l.perRow - 1) * l.strip).toBeLessThanOrEqual(
          Math.max(width - 8, cardW * (1 + MIN_VISIBLE * (l.perRow - 1))) + 1e-6,
        );
        expect(l.rows * l.perRow).toBeGreaterThanOrEqual(n);
        expect((l.rows - 1) * l.perRow).toBeLessThan(n);
      }
    }
  });

  it('cards overlap between 10% and 30% (they show 70% to 90% of their width)', () => {
    expect(MIN_VISIBLE).toBeCloseTo(0.7);
    expect(MAX_VISIBLE).toBeCloseTo(0.9);
    for (const width of [320, 390, 430, 900]) {
      for (let n = 2; n <= 52; n++) {
        const l = handLayout(n, width, FONT);
        const cardW = l.font * 5;
        expect(l.strip + 1e-6).toBeGreaterThanOrEqual(cardW * 0.7);
        expect(l.strip - 1e-6).toBeLessThanOrEqual(cardW * 0.9);
      }
    }
  });

  it('adds rows as the screen gets narrower and the hand bigger', () => {
    expect(handLayout(4, 390, FONT).rows).toBe(1);
    expect(handLayout(8, 390, FONT).rows).toBe(2);
    expect(handLayout(8, 250, FONT).rows).toBeGreaterThan(1);
    expect(handLayout(8, 900, FONT).rows).toBe(1);
    expect(handLayout(52, 390, FONT).rows).toBeGreaterThanOrEqual(5);
  });

  it('draws wrapped rows smaller (two rows, many rows) and single rows at full size', () => {
    expect(handLayout(3, 390, FONT).font).toBe(FONT);
    expect(handLayout(8, 390, FONT).font).toBeCloseTo(FONT * WRAP_SCALE);
    expect(handLayout(30, 390, FONT).font).toBeCloseTo(FONT * MANY_ROWS_SCALE);
  });

  it('spreads a sparse hand until the cards show MAX_VISIBLE of their width, no further', () => {
    const cardW = FONT * 5;
    expect(handLayout(3, 390, FONT).strip).toBeCloseTo(cardW * MAX_VISIBLE);
    expect(handLayout(3, 900, FONT).strip).toBeCloseTo(cardW * MAX_VISIBLE);
    // a fuller row is tighter (down to the minimum overlap limit)
    expect(handLayout(5, 390, FONT).strip).toBeLessThan(cardW * MAX_VISIBLE);
  });

  it('handles an empty hand', () => {
    expect(handLayout(0, 390, FONT).rows).toBe(1);
  });
});
