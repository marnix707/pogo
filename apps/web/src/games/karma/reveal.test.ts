import { describe, expect, it } from 'vitest';
import { REVEAL_BASE_MS, leftoverCount, revealPlan, revealStep, revealTotalMs } from './reveal';

describe('leftover reveal timing', () => {
  const l = { hand: [3, 9], faceDown: [6, null, 14] as (number | null)[] };

  it('counts the face-down cards that are still there plus the hand', () => {
    expect(leftoverCount(l)).toBe(4);
    expect(leftoverCount(null)).toBe(0);
  });

  it('turns face-down cards first, left to right, then the hand', () => {
    const plan = revealPlan(l);
    expect(plan.down[1]).toBeNull();
    expect(plan.down[0]).toBe(REVEAL_BASE_MS);
    expect(plan.down[2]).toBe(REVEAL_BASE_MS + revealStep(4));
    expect(plan.hand[0]).toBe(REVEAL_BASE_MS + 2 * revealStep(4));
  });

  it('has nothing to wait for without cards, and caps a huge hand', () => {
    expect(revealTotalMs(0)).toBe(0);
    expect(revealTotalMs(40)).toBeLessThan(4000);
    expect(revealTotalMs(2)).toBeGreaterThan(REVEAL_BASE_MS);
  });
});
