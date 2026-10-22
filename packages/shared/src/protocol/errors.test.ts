import { describe, expect, it } from 'vitest';
import { KNOWN_ERRORS, UNKNOWN_ERROR_CODE, errorCodeFor, failResult, formatError } from './errors';

describe('error codes', () => {
  it('are AREA-NNN, and one message never has two codes', () => {
    const seen = new Map<string, string>();
    for (const known of KNOWN_ERRORS) {
      expect(known.code).toMatch(/^[A-Z]{3,4}-\d{3}$/);
      if (typeof known.message === 'string') {
        expect(seen.get(known.message) ?? known.code).toBe(known.code);
        seen.set(known.message, known.code);
      }
    }
  });

  it('are found for exact messages and for messages with names and numbers in them', () => {
    expect(errorCodeFor('Room not found')).toBe('ROOM-101');
    expect(errorCodeFor('Not your turn')).toBe('GAME-101');
    expect(errorCodeFor('Karma cannot be played against the computer')).toBe('ROOM-120');
    expect(errorCodeFor('Yatzy supports 1-6 players')).toBe('ROOM-121');
    expect(errorCodeFor('Karma supports at most 5 players')).toBe('ROOM-121');
    expect(errorCodeFor('Race needs at least 2 player(s)')).toBe('ROOM-122');
    expect(errorCodeFor('Nickname must be at least 2 characters')).toBe('ACC-112');
    expect(errorCodeFor('Password must be at least 8 characters')).toBe('ACC-113');
    expect(errorCodeFor('You are banned until 1 Jan 2030, 10:00 UTC. Reason: spam')).toBe(
      'ACC-120',
    );
    expect(errorCodeFor('Karma needs 2-5 players')).toBe('KAR-125');
  });

  it('fall back to SYS-000 for a message nobody catalogued', () => {
    expect(errorCodeFor('Some brand new problem')).toBe(UNKNOWN_ERROR_CODE);
  });

  it('are shown behind the text, with a ref for server errors', () => {
    expect(formatError('Room not found', 'ROOM-101')).toBe('Room not found (ROOM-101)');
    expect(formatError('Something went wrong on our side', 'SYS-500', 'ab12cd')).toBe(
      'Something went wrong on our side (SYS-500 · ab12cd)',
    );
    expect(formatError('Plain')).toBe('Plain');
    // never twice
    expect(formatError('Room not found (ROOM-101)', 'ROOM-101')).toBe('Room not found (ROOM-101)');
  });

  it('are attached to failed results', () => {
    expect(failResult('This room is full')).toEqual({
      ok: false,
      error: 'This room is full',
      code: 'ROOM-102',
    });
  });
});
