import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng, getGame } from '@pogo/shared';
import type { LeaveReason, PublicUser, RoomView } from '@pogo/shared';
import { RoomManager } from './RoomManager';
import { GOAL, raceGame } from './testGame';

const GRACE = 20_000;
const TTL = 600_000;
const STEP = 1_000;

const user = (n: number): PublicUser => ({
  id: `u${n}`,
  nickname: `User${n}`,
  avatar: 'fox',
  isGuest: true,
});
const [a, b, c] = [user(1), user(2), user(3)] as [PublicUser, PublicUser, PublicUser];

function setup() {
  const inbox = new Map<string, { room: RoomView | null; reason?: LeaveReason }[]>();
  const manager = new RoomManager({
    getGame: (id) => (id === 'race' ? raceGame : getGame(id)),
    rng: createSeededRng(5),
    emit: (userId, room, reason) => {
      const list = inbox.get(userId) ?? [];
      list.push({ room, reason });
      inbox.set(userId, list);
    },
    limits: { graceMs: GRACE, emptyTtlMs: TTL, autoStepMs: STEP },
    defaultTurnTimeSec: 30,
  });
  const last = (id: string) => inbox.get(id)?.at(-1);
  const lastRoom = (id: string) => last(id)?.room ?? null;
  const must = <T>(r: { ok: true; data: T } | { ok: false; error: string }): T => {
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  return { manager, inbox, last, lastRoom, must };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('creating and joining', () => {
  it('creates a room with a 5-char code and the creator as host', () => {
    const { manager, must } = setup();
    const room = must(manager.create(a, { gameId: 'race' }));
    expect(room.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}$/);
    expect(room).toMatchObject({
      hostId: a.id,
      status: 'lobby',
      visibility: 'private',
      maxPlayers: 3,
    });
    expect(room.members.map((m) => m.id)).toEqual([a.id]);
  });

  it('rejects unknown games and out-of-range sizes', () => {
    const { manager } = setup();
    expect(manager.create(a, { gameId: 'nope' })).toEqual({ ok: false, error: 'Unknown game' });
    expect(manager.create(a, { gameId: 'race', maxPlayers: 9 }).ok).toBe(false);
    expect(manager.create(a, { gameId: 'race', options: { x: 1 } }).ok).toBe(false);
  });

  it('lets others join by code and tells everyone', () => {
    const { manager, lastRoom, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    const joined = must(manager.join(b, code));
    expect(joined.members.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(lastRoom(a.id)?.members).toHaveLength(2);
  });

  it('is idempotent for members and errors for unknown codes', () => {
    const { manager, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, code));
    expect(must(manager.join(b, code)).members).toHaveLength(2);
    expect(manager.join(c, 'ZZZZZ')).toEqual({ ok: false, error: 'Room not found' });
  });

  it('enforces max players', () => {
    const { manager, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race', maxPlayers: 2 }));
    must(manager.join(b, code));
    expect(manager.join(c, code)).toEqual({ ok: false, error: 'This room is full' });
  });

  it('keeps a user in one room at a time, leaving a lobby automatically', () => {
    const { manager, lastRoom, must } = setup();
    const first = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, first.code));
    const second = must(manager.create(b, { gameId: 'race' }));
    expect(second.code).not.toBe(first.code);
    expect(lastRoom(a.id)?.members.map((m) => m.id)).toEqual([a.id]);
  });
});

describe('leaving and kicking', () => {
  it('transfers host when the host leaves and closes an empty room', () => {
    const { manager, last, lastRoom, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, code));
    manager.leave(a.id);
    expect(last(a.id)).toEqual({ room: null, reason: 'left' });
    expect(lastRoom(b.id)?.hostId).toBe(b.id);
    manager.leave(b.id);
    expect(manager.roomCount).toBe(0);
    expect(manager.join(c, code).ok).toBe(false);
  });

  it('lets only the host kick, and kicked players cannot return', () => {
    const { manager, last, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, code));
    expect(manager.kick(b.id, a.id).ok).toBe(false);
    expect(manager.kick(a.id, b.id).ok).toBe(true);
    expect(last(b.id)).toEqual({ room: null, reason: 'kicked' });
    expect(manager.join(b, code)).toEqual({ ok: false, error: 'You were removed from this room' });
  });
});

describe('settings', () => {
  it('lets the host change them in the lobby only', () => {
    const { manager, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, code));
    expect(manager.updateSettings(b.id, { visibility: 'public' }).ok).toBe(false);
    const updated = must(manager.updateSettings(a.id, { visibility: 'public', maxPlayers: 2 }));
    expect(updated).toMatchObject({ visibility: 'public', maxPlayers: 2 });
    expect(manager.updateSettings(a.id, { maxPlayers: 1 }).ok).toBe(false);
    must(manager.start(a.id));
    expect(manager.updateSettings(a.id, { maxPlayers: 3 }).ok).toBe(false);
  });
});

describe('playing', () => {
  function started() {
    const s = setup();
    const { code } = s.must(s.manager.create(a, { gameId: 'race' }));
    s.must(s.manager.join(b, code));
    const room = s.must(s.manager.start(a.id));
    return { ...s, code, room };
  }

  it('needs the host and enough players to start', () => {
    const { manager, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    expect(manager.start(a.id).ok).toBe(false); // 1 < min 2
    must(manager.join(b, code));
    expect(manager.start(b.id)).toEqual({ ok: false, error: 'Only the host can start the game' });
    expect(manager.start(a.id).ok).toBe(true);
    expect(manager.start(a.id).ok).toBe(false);
  });

  it('blocks new players once started', () => {
    const { manager, code } = started();
    expect(manager.join(c, code)).toEqual({ ok: false, error: 'This game has already started' });
  });

  it('only sends each player their own private information', () => {
    const { lastRoom } = started();
    const viewA = lastRoom(a.id)?.game?.view as { mySecret: number };
    const viewB = lastRoom(b.id)?.game?.view as { mySecret: number };
    expect(viewA.mySecret).toBeTypeOf('number');
    expect(viewA.mySecret).not.toBe(viewB.mySecret);
  });

  it('validates moves: shape, turn order, and membership', () => {
    const { manager } = started();
    expect(manager.move(a.id, { type: 'cheat' })).toEqual({ ok: false, error: 'Invalid move' });
    expect(manager.move(b.id, { type: 'step' })).toEqual({ ok: false, error: 'Not your turn' });
    expect(manager.move(c.id, { type: 'step' }).ok).toBe(false);
    expect(manager.move(a.id, { type: 'step' }).ok).toBe(true);
  });

  it('broadcasts moves, ends the game with results, and supports a rematch', () => {
    const { manager, lastRoom, must } = started();
    for (let i = 0; i < GOAL; i++) {
      must(manager.move(a.id, { type: 'step' }));
      if (i < GOAL - 1) must(manager.move(b.id, { type: 'step' }));
    }
    const done = lastRoom(b.id)!;
    expect(done.status).toBe('finished');
    expect(done.game?.currentPlayers).toEqual([]);
    expect(done.game?.results?.rankings[0]).toMatchObject({ playerId: a.id, rank: 1 });
    expect(manager.move(b.id, { type: 'step' }).ok).toBe(false);

    expect(manager.rematch(b.id).ok).toBe(false);
    const again = must(manager.rematch(a.id));
    expect(again.status).toBe('lobby');
    expect(again.game).toBeUndefined();
  });

  it("won't let a player in a running game start another room", () => {
    const { manager } = started();
    expect(manager.create(a, { gameId: 'race' })).toEqual({
      ok: false,
      error: 'Finish or leave your current game first',
    });
  });

  it('keeps the seat when a player leaves mid-game and auto-plays it', () => {
    const { manager, lastRoom } = started();
    manager.leave(b.id);
    expect(lastRoom(a.id)?.members.find((m) => m.id === b.id)).toMatchObject({ left: true });
    expect(manager.getView(b.id)).toBeNull();
    // a moves, then it's b's (absent) turn → auto-skipped after the grace period
    manager.move(a.id, { type: 'step' });
    vi.advanceTimersByTime(GRACE);
    const view = lastRoom(a.id)?.game?.view as { turn: number; steps: Record<string, number> };
    expect(view.steps[b.id]).toBe(1);
    expect(view.turn).toBe(2);
  });
});

describe('presence, reconnect and timers', () => {
  function started() {
    const s = setup();
    const { code } = s.must(s.manager.create(a, { gameId: 'race' }));
    s.must(s.manager.join(b, code));
    s.must(s.manager.start(a.id));
    return { ...s, code };
  }

  it('marks disconnects and restores the player on reconnect', () => {
    const { manager, lastRoom } = started();
    manager.userDisconnected(b.id);
    expect(lastRoom(a.id)?.members.find((m) => m.id === b.id)?.connected).toBe(false);
    manager.userConnected(b.id);
    expect(lastRoom(a.id)?.members.find((m) => m.id === b.id)?.connected).toBe(true);
    expect(manager.getView(b.id)?.status).toBe('playing');
  });

  it("auto-plays a player's turn when their turn timer runs out", () => {
    const { lastRoom } = started();
    expect(lastRoom(a.id)?.game?.deadline).not.toBeNull();
    vi.advanceTimersByTime(30_000);
    const view = lastRoom(a.id)?.game?.view as { steps: Record<string, number> };
    expect(view.steps[a.id]).toBe(1);
    expect(lastRoom(a.id)?.game?.currentPlayers).toEqual([b.id]);
  });

  it('skips an absent current player after the grace period, much sooner than the turn timer', () => {
    const { manager, lastRoom } = started();
    manager.userDisconnected(a.id);
    vi.advanceTimersByTime(GRACE - 1);
    expect(lastRoom(b.id)?.game?.currentPlayers).toEqual([a.id]);
    vi.advanceTimersByTime(1);
    expect(lastRoom(b.id)?.game?.currentPlayers).toEqual([b.id]);
  });

  it('cancels auto-play when the absent player returns in time', () => {
    const { manager, lastRoom } = started();
    manager.userDisconnected(a.id);
    vi.advanceTimersByTime(GRACE - 1);
    manager.userConnected(a.id);
    vi.advanceTimersByTime(GRACE);
    expect(lastRoom(b.id)?.game?.currentPlayers).toEqual([a.id]);
  });

  it('drops disconnected players from a lobby after the grace period', () => {
    const { manager, last, lastRoom, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, code));
    manager.userDisconnected(b.id);
    vi.advanceTimersByTime(GRACE);
    expect(last(b.id)).toEqual({ room: null, reason: 'timeout' });
    expect(lastRoom(a.id)?.members.map((m) => m.id)).toEqual([a.id]);
  });

  it('deletes rooms nobody is connected to after the TTL', () => {
    const { manager, last } = started();
    manager.userDisconnected(a.id);
    manager.userDisconnected(b.id);
    vi.advanceTimersByTime(TTL - 1);
    expect(manager.roomCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(manager.roomCount).toBe(0);
    expect(last(a.id)?.reason).toBe('closed');
  });
});

describe('with a real game', () => {
  it('paces multi-step auto-play for an absent Yatzy player (roll, pause, score)', () => {
    const { manager, lastRoom, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'yatzy' }));
    must(manager.join(b, code));
    must(manager.start(a.id));
    manager.userDisconnected(a.id);

    const state = () =>
      lastRoom(b.id)?.game?.view as { dice: number[]; players: { scorecard: object }[] };

    vi.advanceTimersByTime(GRACE);
    expect(state().dice).toHaveLength(5); // auto-rolled, turn not over yet
    expect(lastRoom(b.id)?.game?.currentPlayers).toEqual([a.id]);

    vi.advanceTimersByTime(STEP);
    expect(Object.keys(state().players[0]!.scorecard)).toHaveLength(1); // auto-scored
    expect(lastRoom(b.id)?.game?.currentPlayers).toEqual([b.id]);
  });
});
