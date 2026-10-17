import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng, getGame } from '@pogo/shared';
import type { ChatMessage, LeaveReason, PublicUser, RoomView } from '@pogo/shared';
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
  const chats = new Map<string, ChatMessage[]>();
  const histories = new Map<string, ChatMessage[][]>();
  const lobby = { changes: 0 };
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
    emitChat: (userId, message) => chats.set(userId, [...(chats.get(userId) ?? []), message]),
    emitHistory: (userId, messages) =>
      histories.set(userId, [...(histories.get(userId) ?? []), messages]),
    onLobbyChanged: () => {
      lobby.changes++;
    },
  });
  const last = (id: string) => inbox.get(id)?.at(-1);
  const lastRoom = (id: string) => last(id)?.room ?? null;
  const must = <T>(r: { ok: true; data: T } | { ok: false; error: string }): T => {
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  return { manager, inbox, chats, histories, lobby, last, lastRoom, must };
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

describe('public lobby', () => {
  it('lists only public, open lobby rooms, longest-waiting first', () => {
    const { manager, must } = setup();
    expect(manager.listPublic()).toEqual([]);

    const priv = must(manager.create(a, { gameId: 'race' }));
    expect(manager.listPublic()).toEqual([]); // private by default

    must(manager.updateSettings(a.id, { visibility: 'public' }));
    vi.advanceTimersByTime(5);
    const second = must(manager.create(b, { gameId: 'race', visibility: 'public' }));

    const list = manager.listPublic();
    expect(list.map((r) => r.code)).toEqual([priv.code, second.code]);
    expect(list[0]).toMatchObject({
      gameId: 'race',
      gameName: 'Race',
      hostNickname: 'User1',
      hostAvatar: 'fox',
      players: 1,
      maxPlayers: 3,
    });
  });

  it('drops rooms that are full, started, private again, or closed', () => {
    const { manager, must } = setup();
    const room = must(manager.create(a, { gameId: 'race', visibility: 'public', maxPlayers: 2 }));
    expect(manager.listPublic()).toHaveLength(1);

    must(manager.join(b, room.code)); // now full
    expect(manager.listPublic()).toHaveLength(0);

    manager.leave(b.id); // space again
    expect(manager.listPublic()).toHaveLength(1);

    must(manager.updateSettings(a.id, { visibility: 'private' }));
    expect(manager.listPublic()).toHaveLength(0);

    must(manager.updateSettings(a.id, { visibility: 'public' }));
    must(manager.join(b, room.code));
    must(manager.start(a.id)); // started rooms are not joinable
    expect(manager.listPublic()).toHaveLength(0);
  });

  it('removes a room from the list when it is closed', () => {
    const { manager, must } = setup();
    must(manager.create(a, { gameId: 'race', visibility: 'public' }));
    manager.leave(a.id);
    expect(manager.listPublic()).toEqual([]);
  });

  it('notifies the lobby whenever the public list may have changed', () => {
    const { manager, lobby, must } = setup();
    const before = lobby.changes;
    const room = must(manager.create(a, { gameId: 'race', visibility: 'public' }));
    expect(lobby.changes).toBeGreaterThan(before);
    const afterCreate = lobby.changes;
    must(manager.join(b, room.code));
    expect(lobby.changes).toBeGreaterThan(afterCreate);
    const afterJoin = lobby.changes;
    manager.leave(b.id);
    manager.leave(a.id);
    expect(lobby.changes).toBeGreaterThan(afterJoin);
  });

  it('quick match joins the longest-waiting open room', () => {
    const { manager, must } = setup();
    const first = must(manager.create(a, { gameId: 'race', visibility: 'public' }));
    vi.advanceTimersByTime(5);
    must(manager.create(b, { gameId: 'race', visibility: 'public' }));

    const joined = must(manager.quickPlay(c, 'race'));
    expect(joined.code).toBe(first.code);
    expect(joined.members.map((m) => m.id)).toEqual([a.id, c.id]);
  });

  it('quick match opens a new public room when nothing is open', () => {
    const { manager, must } = setup();
    const created = must(manager.quickPlay(a, 'race'));
    expect(created).toMatchObject({ visibility: 'public', hostId: a.id, status: 'lobby' });
    expect(manager.listPublic().map((r) => r.code)).toEqual([created.code]);
  });

  it('quick match skips rooms of other games and unknown games', () => {
    const { manager, must } = setup();
    must(manager.create(a, { gameId: 'race', visibility: 'public' }));
    const yatzy = must(manager.quickPlay(b, 'yatzy'));
    expect(yatzy.gameId).toBe('yatzy');
    expect(manager.quickPlay(c, 'nope')).toEqual({ ok: false, error: 'Unknown game' });
  });

  it('quick match is idempotent for someone already waiting in a room for that game', () => {
    const { manager, must } = setup();
    const mine = must(manager.quickPlay(a, 'race'));
    const again = must(manager.quickPlay(a, 'race'));
    expect(again.code).toBe(mine.code);
    expect(manager.roomCount).toBe(1);
  });
});

describe('chat', () => {
  function twoInRoom() {
    const s = setup();
    const { code } = s.must(s.manager.create(a, { gameId: 'race' }));
    s.must(s.manager.join(b, code));
    return s;
  }

  it('delivers messages to everyone in the room, with the sender identity', () => {
    const { manager, chats, must } = twoInRoom();
    must(manager.chat(a.id, 'hello there'));
    for (const id of [a.id, b.id]) {
      expect(chats.get(id)).toEqual([
        expect.objectContaining({
          id: 1,
          userId: a.id,
          nickname: 'User1',
          avatar: 'fox',
          text: 'hello there',
        }),
      ]);
    }
  });

  it('keeps message ids increasing', () => {
    const { manager, chats, must } = twoInRoom();
    must(manager.chat(a.id, 'one'));
    must(manager.chat(b.id, 'two'));
    expect(chats.get(a.id)?.map((m) => m.id)).toEqual([1, 2]);
  });

  it('masks profanity before anyone sees it', () => {
    const { manager, chats, must } = twoInRoom();
    must(manager.chat(a.id, 'oh shit that was close'));
    expect(chats.get(b.id)?.[0]?.text).toBe('oh **** that was close');
  });

  it('does not reach people outside the room, and outsiders cannot post', () => {
    const { manager, chats } = twoInRoom();
    expect(manager.chat(c.id, 'psst')).toEqual({ ok: false, error: 'You are not in a room' });
    expect(chats.get(c.id)).toBeUndefined();
  });

  it('sends recent history when someone joins or reconnects', () => {
    const { manager, histories, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.chat(a.id, 'first'));
    must(manager.chat(a.id, 'second'));

    must(manager.join(b, code));
    expect(
      histories
        .get(b.id)
        ?.at(-1)
        ?.map((m) => m.text),
    ).toEqual(['first', 'second']);

    manager.userDisconnected(b.id);
    manager.userConnected(b.id);
    expect(histories.get(b.id)).toHaveLength(2);
    expect(
      histories
        .get(b.id)
        ?.at(-1)
        ?.map((m) => m.text),
    ).toEqual(['first', 'second']);
  });

  it('keeps only the latest 100 messages', () => {
    const { manager, histories, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'race' }));
    for (let i = 1; i <= 130; i++) must(manager.chat(a.id, `msg ${i}`));
    must(manager.join(b, code));
    const history = histories.get(b.id)!.at(-1)!;
    expect(history).toHaveLength(100);
    expect(history[0]?.text).toBe('msg 31');
    expect(history.at(-1)?.text).toBe('msg 130');
  });

  it('works during a game and after it ends', () => {
    const { manager, chats, must } = twoInRoom();
    must(manager.start(a.id));
    must(manager.chat(b.id, 'good luck'));
    expect(chats.get(a.id)?.at(-1)?.text).toBe('good luck');
  });

  it('does not deliver to players who left mid-game', () => {
    const { manager, chats, must } = twoInRoom();
    must(manager.start(a.id));
    manager.leave(b.id);
    must(manager.chat(a.id, 'bye'));
    expect(chats.get(b.id)).toBeUndefined();
  });
});
