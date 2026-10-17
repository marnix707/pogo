import { describe, expect, it } from 'vitest';
import { containsProfanity, maskProfanity } from './profanity';

describe('maskProfanity', () => {
  it('masks plain profanity and keeps the rest', () => {
    expect(maskProfanity('what the fuck is this')).toBe('what the **** is this');
    expect(maskProfanity('Shit happens')).toBe('**** happens');
  });

  it('catches suffixes and repeated letters', () => {
    expect(maskProfanity('fucking hell')).toBe('******* hell');
    expect(maskProfanity('fuuuuck you')).toBe('******* you');
    expect(maskProfanity('you bitches')).toBe('you *******');
  });

  it('catches leetspeak and separators', () => {
    expect(maskProfanity('sh1t')).toBe('****');
    expect(maskProfanity('f.u.c.k')).toBe('*******');
    expect(maskProfanity('$hit')).toBe('****');
    expect(maskProfanity('f u c k')).toBe('*******');
  });

  it('works regardless of case and punctuation', () => {
    expect(maskProfanity('FUCK!')).toBe('****!');
    expect(maskProfanity('(shit)')).toBe('(****)');
  });

  it('catches the Dutch words', () => {
    expect(maskProfanity('wat een klootzak')).toBe('wat een ********');
  });

  it('leaves innocent words alone (no Scunthorpe problem)', () => {
    for (const ok of [
      'class',
      'assume',
      'pass the salt',
      'Scunthorpe',
      'cockpit',
      'hello',
      'shiitake',
      'analysis',
      'kutje',
      'a good game, well played!',
      '1 2 3 4 5 yatzy 50 points',
    ]) {
      expect(maskProfanity(ok)).toBe(ok);
    }
  });

  it('keeps the string length so nothing shifts', () => {
    const text = 'oh sh1t, you f.u.c.k.e.r';
    expect(maskProfanity(text)).toHaveLength(text.length);
  });

  it('detects it', () => {
    expect(containsProfanity('fuck')).toBe(true);
    expect(containsProfanity('friendly')).toBe(false);
  });
});
