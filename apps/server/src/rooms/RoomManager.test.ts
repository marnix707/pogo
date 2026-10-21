import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng, getGame, karma, maskProfanity } from '@pogo/shared';
import type { ChatMessage, LeaveReason, PublicUser, RoomView } from '@pogo/shared';
import { RoomManager } from './RoomManager';
import { GOAL, raceGame } from './testGame';

const GRACE = 20_000;
const TTL = 600_000;
const STEP = 1_000;
const BOT = 1_000;

const user = (n: number): PublicUser => ({
  id: `u${n}`,
  nickname: `User${n}`,
  avatar: 'fox',
  isGuest: true,
});
const [a, b, c] = [user(1), user(2), user(3)] as [PublicUser, PublicUser, PublicUser];

function setup(maskText: (text: string) => string = maskProfanity) {
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
    limits: { graceMs: GRACE, emptyTtlMs: TTL, autoStepMs: STEP, botMs: BOT },
    defaultTurnTimeSec: 30,
    maskText,
    emitChat: (userId, message) => chats.set(userId, [...(chats.get(userId) ?? []), message]),
    emitHistory: (userId, messages) =>
      histories.set(userId, [...(histories.get(userId) ?? []), messages]),
    onGameFinished: () => {},
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
      visibility: 'public',
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

  it('with unlimited turn time nothing is ever auto-played for a disconnected player', () => {
    const s = setup();
    const { code } = s.must(s.manager.create(a, { gameId: 'race', turnTimeSec: 0 }));
    s.must(s.manager.join(b, code));
    s.must(s.manager.start(a.id));
    s.manager.userDisconnected(a.id);
    vi.advanceTimersByTime(TTL / 2);
    expect(s.lastRoom(b.id)?.game?.currentPlayers).toEqual([a.id]);
    expect(s.lastRoom(b.id)?.game?.deadline).toBeNull();
    s.manager.userConnected(a.id);
    expect(s.lastRoom(b.id)?.game?.currentPlayers).toEqual([a.id]);
  });

  it('a free move (sharing held dice) does not restart the turn clock', () => {
    const s = setup();
    const { code } = s.must(s.manager.create(a, { gameId: 'yatzy', turnTimeSec: 30 }));
    s.must(s.manager.join(b, code));
    s.must(s.manager.start(a.id));
    s.must(s.manager.move(a.id, { type: 'roll', held: [false, false, false, false, false] }));
    const before = s.lastRoom(a.id)!.game!.deadline;
    vi.advanceTimersByTime(10_000);
    s.must(s.manager.move(a.id, { type: 'hold', held: [true, false, false, false, false] }));
    expect(s.lastRoom(b.id)!.game!.deadline).toBe(before);
    expect((s.lastRoom(b.id)!.game!.view as { held: boolean[] }).held[0]).toBe(true);
    // A real move does restart it.
    s.must(s.manager.move(a.id, { type: 'roll', held: [true, false, false, false, false] }));
    expect(s.lastRoom(b.id)!.game!.deadline).toBeGreaterThan(before!);
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

    const priv = must(manager.create(a, { gameId: 'race', visibility: 'private' }));
    expect(manager.listPublic()).toEqual([]);
    must(manager.updateSettings(a.id, { visibility: 'public' }));
    expect(manager.listPublic().map((r) => r.code)).toEqual([priv.code]); // public by default
    must(manager.updateSettings(a.id, { visibility: 'private' }));

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

describe('with Karma (simultaneous swap phase, private hands)', () => {
  function karmaRoom() {
    const s = setup();
    const { code } = s.must(s.manager.create(a, { gameId: 'karma' }));
    s.must(s.manager.join(b, code));
    s.must(s.manager.start(a.id));
    return s;
  }

  type View = {
    phase: string;
    players: { id: string; hand: number[] | null; handCount: number; faceDown: boolean[] }[];
    stockCount: number;
  };
  const viewOf = (room: RoomView | null) => room?.game?.view as View;

  it('never sends one player the cards in another hand or the face-down cards', () => {
    const { lastRoom } = karmaRoom();
    const forA = viewOf(lastRoom(a.id));
    const forB = viewOf(lastRoom(b.id));
    expect(forA.players.find((p) => p.id === a.id)?.hand).toHaveLength(3);
    expect(forA.players.find((p) => p.id === b.id)?.hand).toBeNull();
    expect(forB.players.find((p) => p.id === a.id)?.hand).toBeNull();
    expect(forB.players.find((p) => p.id === b.id)?.hand).toHaveLength(3);
    expect(forA.players[0]?.faceDown).toEqual([true, true, true]);
    expect(forA.stockCount).toBe(52 - 18);
  });

  it('lets both players act in the swap phase, and moves to play when both are ready', () => {
    const { manager, lastRoom, must } = karmaRoom();
    expect(lastRoom(a.id)?.game?.currentPlayers.sort()).toEqual([a.id, b.id]);
    must(manager.move(a.id, { type: 'ready' }));
    expect(lastRoom(a.id)?.game?.currentPlayers).toEqual([b.id]);
    must(manager.move(b.id, { type: 'ready' }));
    expect(viewOf(lastRoom(a.id)).phase).toBe('play');
    expect(lastRoom(a.id)?.game?.currentPlayers).toHaveLength(1);
  });

  it('auto-readies players who run out of time, then auto-plays the first turn', () => {
    const { manager, lastRoom } = karmaRoom();
    vi.advanceTimersByTime(30_000); // the turn timer: they start arranging their table...
    vi.advanceTimersByTime(8 * STEP); // ...a swap per step, then ready
    expect(viewOf(lastRoom(a.id)).phase).toBe('play');
    const view = viewOf(lastRoom(a.id)) as View & { pile: number[] };
    const [starter] = lastRoom(a.id)!.game!.currentPlayers;
    expect(starter).toBeDefined();
    vi.advanceTimersByTime(30_000);
    const after = viewOf(lastRoom(a.id)) as View & { pile: number[] };
    // Someone played or picked up on the auto-played turn.
    expect(after.pile.length !== view.pile.length || after.stockCount !== view.stockCount).toBe(
      true,
    );
    expect(manager.roomCount).toBe(1);
  });
});

describe('profanity filter switch', () => {
  it('delivers chat untouched when the filter is off', () => {
    const { manager, chats, must } = setup((text) => text);
    const { code } = must(manager.create(a, { gameId: 'race' }));
    must(manager.join(b, code));
    must(manager.chat(a.id, 'oh shit that was close'));
    expect(chats.get(b.id)?.[0]?.text).toBe('oh shit that was close');
  });
});

describe('computer players', () => {
  type KView = karma.KarmaView;
  const kview = (room: RoomView | null) => room?.game?.view as KView;
  const seatOf = (room: RoomView | null, id: string) =>
    kview(room).players.find((p) => p.id === id)!;

  it('starts a game against the computer straight away', () => {
    const { manager, lastRoom, must } = setup();
    const room = must(manager.create(a, { gameId: 'karma', bots: 1, autoStart: true }));
    expect(room.status).toBe('playing');
    expect(room.bots).toBe(1);
    expect(room.members.map((m) => [m.nickname, m.bot])).toEqual([
      ['User1', false],
      ['Robo', true],
    ]);
    expect(room.members[1]).toMatchObject({ avatar: 'robot', connected: true, left: false });
    // The computer's hand is as private as anyone else's.
    expect(seatOf(lastRoom(a.id), a.id).hand).toHaveLength(3);
    expect(seatOf(lastRoom(a.id), 'bot:1').hand).toBeNull();
    expect(seatOf(lastRoom(a.id), 'bot:1').handCount).toBe(3);
    expect(manager.listPublic()).toEqual([]);
  });

  it('picks computer names that nobody in the room already uses', () => {
    const { manager, must } = setup();
    const robo: PublicUser = { id: 'x1', nickname: 'robo', avatar: 'fox', isGuest: true };
    const room = must(manager.create(robo, { gameId: 'karma', bots: 2, autoStart: true }));
    expect(room.members.map((m) => m.nickname)).toEqual(['robo', 'Bolt', 'Pixel']);
  });

  it('only works for games that support it, and within the player limits', () => {
    const { manager } = setup();
    expect(manager.create(a, { gameId: 'race', bots: 1 })).toEqual({
      ok: false,
      error: 'Race cannot be played against the computer',
    });
    expect(manager.create(a, { gameId: 'yatzy', bots: 1 }).ok).toBe(false);
    expect(manager.create(a, { gameId: 'karma', bots: 5 }).ok).toBe(false); // 1 + 5 > 5 seats
    expect(manager.create(a, { gameId: 'karma', bots: 4, autoStart: true }).ok).toBe(true);
  });

  it('can be added to a waiting room by the host, and fills the room for other people', () => {
    const { manager, must } = setup();
    const { code } = must(manager.create(a, { gameId: 'karma' }));
    expect(manager.updateSettings(b.id, { bots: 1 }).ok).toBe(false); // not the host
    expect(must(manager.updateSettings(a.id, { bots: 4 })).bots).toBe(4);
    expect(manager.join(b, code)).toEqual({ ok: false, error: 'This room is full' });
    expect(manager.updateSettings(a.id, { bots: 5 }).ok).toBe(false);
    must(manager.updateSettings(a.id, { bots: 1 }));
    must(manager.join(b, code)); // room for another person again
  });

  it('refuses to start a game that is too small even with computers', () => {
    const { manager, must } = setup();
    must(manager.create(a, { gameId: 'karma' })); // Karma needs 2 and there are no computers
    expect(manager.start(a.id).ok).toBe(false);
  });

  it('makes its moves after a short think, and not while every person is away', () => {
    const { manager, lastRoom, must } = setup();
    must(manager.create(a, { gameId: 'karma', bots: 1, autoStart: true }));
    expect(seatOf(lastRoom(a.id), 'bot:1').ready).toBe(false);

    manager.userDisconnected(a.id);
    vi.advanceTimersByTime(10 * BOT);
    expect(seatOf(manager.getView(a.id), 'bot:1').ready).toBe(false); // paused: nobody to play with

    manager.userConnected(a.id);
    vi.advanceTimersByTime(BOT - 1);
    expect(seatOf(manager.getView(a.id), 'bot:1').ready).toBe(false); // still thinking...
    vi.advanceTimersByTime(6 * BOT); // swaps (a few), then ready
    expect(seatOf(manager.getView(a.id), 'bot:1').ready).toBe(true);
  });

  it('closes the room when the last person leaves, even though computers remain', () => {
    const { manager, must } = setup();
    must(manager.create(a, { gameId: 'karma', bots: 2, autoStart: true }));
    expect(manager.roomCount).toBe(1);
    manager.leave(a.id);
    expect(manager.roomCount).toBe(0);
  });

  it('cannot be kicked, chat, or be addressed like a person', () => {
    const { manager, must } = setup();
    must(manager.create(a, { gameId: 'karma', bots: 1, autoStart: true }));
    expect(manager.kick(a.id, 'bot:1')).toEqual({
      ok: false,
      error: 'That player is not in the room',
    });
    expect(manager.chat('bot:1', 'hi').ok).toBe(false);
    expect(manager.move('bot:1', { type: 'ready' }).ok).toBe(false);
  });

  /** A person who plays like a tired human: lowest legal card (sets), pick up, blind cards. */
  function humanMove(view: KView, me: string, jitter: () => number): unknown {
    const mine = view.players.find((p) => p.id === me)!;
    if (view.phase === 'swap') return { type: 'ready' };
    if (view.phase === 'pick') return { type: 'pickRule', rule: view.pick!.choices[0]! };
    if (view.mustPickUp) return { type: 'pickup' }; // a too-low blind card is on the pile
    const zone = karma.activeZone(mine);
    if (zone === 'down') return { type: 'playDown', index: mine.faceDown.findIndex(Boolean) };
    const source = (zone === 'hand' ? (mine.hand ?? []) : mine.faceUp).filter(
      (c): c is number => c !== null,
    );
    const ranks = [...new Set(source.map(karma.rankOf))]
      .filter((r) => karma.canPlayRank(view.pile, r))
      .sort((x, y) => (x === 10 ? 200 : x === 2 ? 100 : x) - (y === 10 ? 200 : y === 2 ? 100 : y));
    if (ranks.length === 0) return { type: 'pickup' };
    const rank = ranks.length > 1 && jitter() < 0.25 ? ranks[1] : ranks[0];
    return { type: 'play', cards: source.filter((c) => karma.rankOf(c) === rank) };
  }

  function playOut(bots = 2, seed = 99, options?: unknown) {
    const s = setup();
    s.must(s.manager.create(a, { gameId: 'karma', bots, autoStart: true, options }));
    const rng = createSeededRng(seed);
    const jitter = () => rng.int(1000) / 1000;
    for (let i = 0; i < 4000; i++) {
      const room = s.manager.getView(a.id)!;
      if (room.status === 'finished') return { ...s, room };
      const current = room.game!.currentPlayers;
      if (current.includes(a.id)) {
        s.must(s.manager.move(a.id, humanMove(kview(room), a.id, jitter)));
      } else {
        vi.advanceTimersByTime(BOT); // the computer's turn
      }
    }
    throw new Error('the game against the computer never finished');
  }

  it('plays a whole game against two computers, with a proper result list', () => {
    const { room } = playOut();
    expect(room.status).toBe('finished');
    const ids = room.game!.results!.rankings.map((r) => r.playerId).sort();
    expect(ids).toEqual([a.id, 'bot:1', 'bot:2'].sort());
    expect(room.game!.results!.rankings.map((r) => r.rank)).toEqual([1, 2, 3]);
    // Everybody can be named in the results.
    for (const id of ids) expect(room.members.some((m) => m.id === id)).toBe(true);
  });

  it.each([1, 2, 3, 4])(
    'games against %i computers always finish with a full ranking, whoever goes out first',
    (bots) => {
      for (let seed = 1; seed <= 30; seed++) {
        const { room } = playOut(bots, seed);
        expect(room.status).toBe('finished');
        expect(room.game!.results!.rankings.map((r) => r.rank)).toEqual(
          Array.from({ length: bots + 1 }, (_, i) => i + 1),
        );
      }
    },
    120_000,
  );

  it('party mode: the winner switches a rule and "Play again" starts the next game with it', () => {
    const first = playOut(2, 7, { mode: 'party' });
    const { manager, must } = first;
    expect((first.room.game!.view as { rules: string[] }).rules).toEqual([]);
    const next = must(manager.rematch(a.id));
    expect(next.status).toBe('playing');
    expect((next.options as { mode: string }).mode).toBe('party');
    // A computer winner picks at random, so only check that exactly one rule was switched on.
    const rules = (next.game!.view as { rules: string[] }).rules;
    expect(rules).toHaveLength(1);
    expect((next.options as { rules: string[] }).rules).toEqual(rules);
    expect(next.members.map((m) => m.nickname)).toEqual(['User1', 'Robo', 'Bolt']);
  });

  it('epic mode starts with every rule on, normal mode with none', () => {
    const epic = playOut(1, 3, { mode: 'epic' });
    expect((epic.room.game!.view as { rules: string[] }).rules).toEqual(
      karma.KARMA_RULES.map((r) => r.id),
    );
    const normal = playOut(1, 3);
    expect((normal.room.game!.view as { rules: string[] }).rules).toEqual([]);
  });

  it('a rematch starts the next game at once, with new computer seats', () => {
    const { manager, must } = playOut();
    const next = must(manager.rematch(a.id));
    expect(next.status).toBe('playing');
    expect(next.members.map((m) => m.nickname)).toEqual(['User1', 'Robo', 'Bolt']);
  });

  it('a rematch to the lobby removes the computer seats, keeps the setting, and brings them back on start', () => {
    const { manager, must } = playOut();
    const lobby = must(manager.rematch(a.id, true));
    expect(lobby.status).toBe('lobby');
    expect(lobby.members.map((m) => m.id)).toEqual([a.id]);
    expect(lobby.bots).toBe(2);
    const again = must(manager.start(a.id));
    expect(again.members.map((m) => m.nickname)).toEqual(['User1', 'Robo', 'Bolt']);
  });
});

describe('ready and auto start', () => {
  const COUNTDOWN = 3_000;
  const twoInLobby = (game = 'race') => {
    const t = setup();
    const room = t.must(t.manager.create(a, { gameId: game }));
    t.must(t.manager.join(b, room.code));
    return { ...t, code: room.code };
  };

  it('does not start until everybody is ready, then starts after the countdown', () => {
    const { manager, lastRoom, must } = twoInLobby();
    must(manager.setReady(a.id, true));
    vi.advanceTimersByTime(60_000);
    expect(lastRoom(a.id)?.status).toBe('lobby');
    expect(lastRoom(a.id)?.startsAt).toBeNull();

    must(manager.setReady(b.id, true));
    const countdown = lastRoom(a.id);
    expect(countdown?.members.map((m) => m.ready)).toEqual([true, true]);
    expect(countdown!.startsAt! - countdown!.serverTime).toBe(COUNTDOWN);
    vi.advanceTimersByTime(COUNTDOWN - 1);
    expect(lastRoom(a.id)?.status).toBe('lobby');
    vi.advanceTimersByTime(1);
    expect(lastRoom(a.id)?.status).toBe('playing');
  });

  it('un-readying during the countdown cancels it', () => {
    const { manager, lastRoom, must } = twoInLobby();
    must(manager.setReady(a.id, true));
    must(manager.setReady(b.id, true));
    vi.advanceTimersByTime(1_000);
    must(manager.setReady(b.id, false));
    expect(lastRoom(a.id)?.startsAt).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(lastRoom(a.id)?.status).toBe('lobby');
  });

  it('a settings change resets everyone, and nobody can start by hand any more', () => {
    const { manager, lastRoom, must } = twoInLobby();
    must(manager.setReady(a.id, true));
    must(manager.setReady(b.id, true));
    must(manager.updateSettings(a.id, { turnTimeSec: 60 }));
    expect(lastRoom(a.id)?.members.some((m) => m.ready)).toBe(false);
    expect(lastRoom(a.id)?.startsAt).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(lastRoom(a.id)?.status).toBe('lobby');
  });

  it('a newcomer is not ready, so a running countdown stops', () => {
    const { manager, lastRoom, must, code } = twoInLobby();
    must(manager.setReady(a.id, true));
    must(manager.setReady(b.id, true));
    must(manager.join(c, code));
    expect(lastRoom(a.id)?.startsAt).toBeNull();
  });

  it('starts when the only person who was not ready leaves', () => {
    const { manager, lastRoom, must } = twoInLobby('yatzy'); // (Yatzy can be played alone)
    must(manager.setReady(a.id, true));
    manager.leave(b.id);
    vi.advanceTimersByTime(COUNTDOWN);
    expect(lastRoom(a.id)?.status).toBe('playing');
  });

  it('never starts below the minimum number of players; computers count as seats', () => {
    const t = setup();
    const room = t.must(t.manager.create(a, { gameId: 'karma' }));
    t.must(t.manager.setReady(a.id, true));
    vi.advanceTimersByTime(60_000);
    expect(t.lastRoom(a.id)?.status).toBe('lobby');
    t.must(t.manager.updateSettings(a.id, { bots: 1 }));
    t.must(t.manager.setReady(a.id, true));
    vi.advanceTimersByTime(COUNTDOWN);
    expect(t.lastRoom(a.id)?.status).toBe('playing');
    expect(room.code).toBeTruthy();
  });

  it('only works in the lobby', () => {
    const { manager } = twoInLobby();
    manager.setReady(a.id, true);
    manager.setReady(b.id, true);
    vi.advanceTimersByTime(COUNTDOWN);
    expect(manager.setReady(a.id, false).ok).toBe(false);
  });
});
