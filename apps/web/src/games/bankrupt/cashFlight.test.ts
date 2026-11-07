import { describe, expect, it } from 'vitest';
import { arcPoint, speedRamp } from './useCashFx';

describe('the money flight', () => {
  it('starts slowly, is fastest in the middle and eases off only a little at the end', () => {
    expect(speedRamp(0)).toBe(0);
    expect(speedRamp(1)).toBeCloseTo(1, 5);
    const v = (t: number) => speedRamp(t + 0.02) - speedRamp(t);
    expect(v(0.02)).toBeLessThan(v(0.5)); // slow start
    expect(v(0.95)).toBeLessThan(v(0.5)); // a bit slower at the end ...
    expect(v(0.95)).toBeGreaterThan(v(0.02)); // ... but not as slow as the start
    for (let t = 0; t < 1; t += 0.05) expect(speedRamp(t + 0.05)).toBeGreaterThan(speedRamp(t));
  });
  it('curves over the middle of the board between the two players', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const centre = { x: 50, y: 80 };
    expect(arcPoint(a, b, centre, 0)).toEqual(a);
    expect(arcPoint(a, b, centre, 1)).toEqual(b);
    const mid = arcPoint(a, b, centre, 0.5);
    expect(Math.abs(mid.y)).toBeGreaterThan(10); // not a straight line
    expect(Math.abs(mid.x - 50)).toBeLessThan(25);
  });
});
