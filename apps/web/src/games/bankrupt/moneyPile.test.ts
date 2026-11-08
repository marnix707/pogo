import { describe, expect, it } from 'vitest';
import { bundlesFor } from './MoneyPile';

describe('money pile', () => {
  it('no money, no bundles; more height, more bundles', () => {
    expect(bundlesFor(0)).toBe(0);
    let last = 0;
    for (let h = 1; h <= 300; h += 7) {
      const n = bundlesFor(h);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(bundlesFor(200)).toBeGreaterThan(bundlesFor(100));
  });
  it('never asks for more bundles than exist', () => {
    expect(bundlesFor(10_000)).toBeGreaterThan(100);
  });
});
