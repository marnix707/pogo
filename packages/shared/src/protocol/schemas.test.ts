import { describe, expect, it } from 'vitest';
import { profileSchema, roomCodeSchema, roomCreateSchema, sanitizeNickname } from './schemas';

describe('nickname', () => {
  it('sanitizes control chars, angle brackets and whitespace', () => {
    expect(sanitizeNickname('  Ada\u0000  <b>Lovelace</b> ')).toBe('Ada bLovelace/b');
    expect(sanitizeNickname('a\n\tb')).toBe('a b');
  });

  it('enforces length after sanitizing', () => {
    expect(profileSchema.safeParse({ nickname: ' a ', avatar: 'fox' }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'x'.repeat(21), avatar: 'fox' }).success).toBe(
      false,
    );
    const ok = profileSchema.parse({ nickname: '  Mo   ', avatar: 'fox' });
    expect(ok.nickname).toBe('Mo');
  });

  it('rejects unknown avatars', () => {
    expect(profileSchema.safeParse({ nickname: 'Mo', avatar: 'dragon' }).success).toBe(false);
  });
});

describe('room schemas', () => {
  it('normalizes codes', () => {
    expect(roomCodeSchema.parse(' ab3k9 ')).toBe('AB3K9');
    expect(roomCodeSchema.safeParse('a b').success).toBe(false);
    expect(roomCodeSchema.safeParse('x').success).toBe(false);
  });

  it('defaults visibility to private and bounds numbers', () => {
    expect(roomCreateSchema.parse({ gameId: 'yatzy' }).visibility).toBe('private');
    expect(roomCreateSchema.safeParse({ gameId: 'yatzy', maxPlayers: 0 }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ gameId: 'yatzy', turnTimeSec: 9999 }).success).toBe(false);
  });
});
