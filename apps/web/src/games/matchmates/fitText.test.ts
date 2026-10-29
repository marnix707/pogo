import { describe, expect, it } from 'vitest';
import { fitInto } from './fitText';

const screen = { left: 0, top: 0, right: 400, bottom: 800 };

describe('fitInto: texts stay on the screen', () => {
  it('leaves a text that fits alone', () => {
    expect(fitInto({ left: 100, top: 100, right: 250, bottom: 130 }, screen)).toEqual({
      dx: 0,
      dy: 0,
      tooWide: false,
      tooTall: false,
    });
  });
  it('pulls a text back in that sticks out on the left or the right', () => {
    expect(fitInto({ left: -40, top: 100, right: 120, bottom: 130 }, screen).dx).toBe(46);
    expect(fitInto({ left: 300, top: 100, right: 440, bottom: 130 }, screen).dx).toBe(-46);
  });
  it('pulls a text back in at the top and the bottom', () => {
    expect(fitInto({ left: 100, top: -10, right: 200, bottom: 20 }, screen).dy).toBe(16);
    expect(fitInto({ left: 100, top: 790, right: 200, bottom: 820 }, screen).dy).toBe(-26);
  });
  it('says so when a text is wider than the screen (it has to wrap)', () => {
    const r = fitInto({ left: -50, top: 100, right: 480, bottom: 130 }, screen);
    expect(r.tooWide).toBe(true);
    expect(r.dx).toBe(56);
  });
});
