import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng';
import { createDiceRng } from './testing';

describe('createSeededRng', () => {
  it('is deterministic per seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    expect(Array.from({ length: 20 }, () => a.int(6))).toEqual(
      Array.from({ length: 20 }, () => b.int(6)),
    );
  });

  it('stays in range and covers every die face', () => {
    const rng = createSeededRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });
});

describe('createDiceRng', () => {
  it('replays scripted faces and then throws', () => {
    const rng = createDiceRng([3, 6]);
    expect(rng.int(6)).toBe(2);
    expect(rng.int(6)).toBe(5);
    expect(() => rng.int(6)).toThrow();
  });
});
