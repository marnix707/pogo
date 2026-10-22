import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS,
  markRecoverySaved,
  parsePlayers,
  removePlayer,
  upsertPlayer,
} from './players';
import type { SavedPlayer } from './players';

const p = (id: string, extra: Partial<SavedPlayer> = {}): SavedPlayer => ({
  id,
  nickname: `Nick ${id}`,
  avatar: 'fox',
  token: `t-${id}`,
  recoverySaved: false,
  ...extra,
});

describe('players on this device', () => {
  it('puts the latest player first and keeps one entry per player', () => {
    const list = upsertPlayer(upsertPlayer([], p('a')), p('b'));
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
    const again = upsertPlayer(list, { id: 'a', nickname: 'Renamed', avatar: 'cat', token: 't2' });
    expect(again.map((x) => x.id)).toEqual(['a', 'b']);
    expect(again[0]).toMatchObject({ nickname: 'Renamed', token: 't2' });
  });

  it('remembers that a recovery link was saved, also across upserts', () => {
    let list = upsertPlayer([], p('a'));
    list = markRecoverySaved(list, 'a');
    expect(list[0]!.recoverySaved).toBe(true);
    list = upsertPlayer(list, { id: 'a', nickname: 'New', avatar: 'fox', token: 'x' });
    expect(list[0]!.recoverySaved).toBe(true);
  });

  it('keeps at most MAX_PLAYERS and drops the oldest', () => {
    let list: SavedPlayer[] = [];
    for (let i = 0; i < MAX_PLAYERS + 3; i++) list = upsertPlayer(list, p(String(i)));
    expect(list).toHaveLength(MAX_PLAYERS);
    expect(list[0]!.id).toBe(String(MAX_PLAYERS + 2));
    expect(list.some((x) => x.id === '0')).toBe(false);
  });

  it('removes a player', () => {
    expect(removePlayer([p('a'), p('b')], 'a').map((x) => x.id)).toEqual(['b']);
  });

  it('survives corrupt storage', () => {
    expect(parsePlayers(null)).toEqual([]);
    expect(parsePlayers('not json')).toEqual([]);
    expect(parsePlayers('{"a":1}')).toEqual([]);
    expect(parsePlayers(JSON.stringify([{ id: 1 }, p('ok')])).map((x) => x.id)).toEqual(['ok']);
  });
});
