import { describe, expect, it } from 'vitest';
import {
  chatSendSchema,
  roomSettingsSchema,
  profileSchema,
  roomCodeSchema,
  roomCreateSchema,
  sanitizeNickname,
} from './schemas';

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

describe('chat schema', () => {
  it('trims, collapses whitespace and strips control characters', () => {
    expect(chatSendSchema.parse({ text: '  hello\n\n  world\u0000 ' }).text).toBe('hello world');
  });

  it('keeps emoji and non-latin text', () => {
    expect(chatSendSchema.parse({ text: 'gg 🎲🎉 dank je' }).text).toBe('gg 🎲🎉 dank je');
  });

  it('rejects empty and too long messages', () => {
    expect(chatSendSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(chatSendSchema.safeParse({ text: 'x'.repeat(301) }).success).toBe(false);
    expect(chatSendSchema.safeParse({ text: 'x'.repeat(300) }).success).toBe(true);
    expect(chatSendSchema.safeParse({}).success).toBe(false);
  });
});

describe('computer player settings', () => {
  it('accepts bots and autoStart when creating a room', () => {
    const parsed = roomCreateSchema.parse({ gameId: 'karma', bots: 2, autoStart: true });
    expect(parsed).toMatchObject({ bots: 2, autoStart: true, visibility: 'private' });
  });

  it('bounds the number of bots', () => {
    expect(roomCreateSchema.safeParse({ gameId: 'karma', bots: -1 }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ gameId: 'karma', bots: 9 }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ gameId: 'karma', bots: 1.5 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ bots: 3 }).success).toBe(true);
    expect(roomSettingsSchema.safeParse({ bots: 20 }).success).toBe(false);
  });
});
