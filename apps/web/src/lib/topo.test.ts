import { describe, expect, it } from 'vitest';
import { contour, heightAt, levels, makeNoise } from './topo';

describe('topo', () => {
  it('noise is deterministic per seed and stays in range', () => {
    const a = makeNoise(3);
    const b = makeNoise(3);
    expect(a(1.3, 2.7, 0.4)).toBe(b(1.3, 2.7, 0.4));
    expect(makeNoise(4)(1.3, 2.7, 0.4)).not.toBe(a(1.3, 2.7, 0.4));
    for (let i = 0; i < 200; i++)
      expect(Math.abs(a(i * 0.37, i * 0.19, i * 0.05))).toBeLessThanOrEqual(1);
  });

  it('the height field stays in a band the contour levels cover, and moves over time', () => {
    const n = makeNoise(7);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 400; i++) {
      const h = heightAt(n, i * 0.13, (i % 17) * 0.21, i * 0.3);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThan(1);
    expect(heightAt(n, 1, 1, 0)).not.toBe(heightAt(n, 1, 1, 30));
    const ls = levels(12);
    expect(ls).toHaveLength(12);
    expect(ls[0]).toBeCloseTo(0.14);
    expect(ls[11]).toBeCloseTo(0.86);
  });

  it('contours a slope with one straight line at the right place', () => {
    // Heights rise from 0 (left) to 1 (right) over a 5x3 grid with cell size 10: level 0.5 is at x = 20.
    const cols = 5;
    const rows = 3;
    const values = Array.from({ length: cols * rows }, (_, k) => (k % cols) / (cols - 1));
    const segs: number[][] = [];
    contour(values, cols, rows, 10, 0.5, (...s) => segs.push(s));
    expect(segs).toHaveLength(2); // one per row of cells
    for (const [x1, , x2] of segs) {
      expect(x1).toBeCloseTo(20);
      expect(x2).toBeCloseTo(20);
    }
  });

  it('draws nothing when the whole field is above or below the level, and rings round a peak', () => {
    const flat = new Array(16).fill(0.3);
    let n = 0;
    contour(flat, 4, 4, 10, 0.5, () => n++);
    expect(n).toBe(0);
    // A single high sample makes a closed diamond of 4 segments around it.
    const peak = new Array(25).fill(0);
    peak[12] = 1;
    n = 0;
    contour(peak, 5, 5, 10, 0.5, () => n++);
    expect(n).toBe(4);
  });
});
