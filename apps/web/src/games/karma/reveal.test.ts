import { describe, expect, it } from 'vitest';
import {
  AFTER_LAST_CARD_MS,
  REVEAL_BASE_MS,
  REVEAL_FLIP_MS,
  leftoverCount,
  revealPlan,
  revealStartMs,
  revealStep,
  revealTotalMs,
} from './reveal';

describe('leftover reveal timing', () => {
  const l = { hand: [3, 9], faceDown: [6, null, 14] as (number | null)[] };

  it('counts the face-down cards that are still there plus the hand', () => {
    expect(leftoverCount(l)).toBe(4);
    expect(leftoverCount(null)).toBe(0);
  });

  it('turns face-down cards first, left to right, then the hand, from the given start', () => {
    const plan = revealPlan(l, 5000);
    expect(plan.down[1]).toBeNull();
    expect(plan.down[0]).toBe(5000);
    expect(plan.down[2]).toBe(5000 + revealStep(4));
    expect(plan.hand[0]).toBe(5000 + 2 * revealStep(4));
  });

  it('starts after a last face-down card has finished turning (the confetti), else soon', () => {
    expect(revealStartMs(true)).toBe(AFTER_LAST_CARD_MS);
    expect(revealStartMs(true)).toBeGreaterThan(3120);
    expect(revealStartMs(false)).toBe(REVEAL_BASE_MS);
  });

  it('ends when the last card has finished turning; nothing to wait for without cards', () => {
    expect(revealTotalMs(0)).toBe(0);
    expect(revealTotalMs(1, 1000)).toBe(1000 + REVEAL_FLIP_MS);
    expect(revealTotalMs(3, 1000)).toBe(1000 + 2 * revealStep(3) + REVEAL_FLIP_MS);
  });

  it('turns a huge hand quicker so it stays bounded', () => {
    expect(revealTotalMs(40, 0)).toBeLessThan(4000);
  });
});
