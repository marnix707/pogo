import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createSeededRng } from '@pogo/shared';
import type {
  Ack,
  ChatMessage,
  PublicRoomSummary,
  AuthResponse,
  ClientToServerEvents,
  RoomView,
  ServerToClientEvents,
} from '@pogo/shared';
import { buildApp } from './app';
import { createMemoryUserStore } from './auth/userStore';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let base = '';
let stop: () => Promise<void>;
const open: Client[] = [];

beforeAll(async () => {
  const { app, close } = await buildApp({
    config: {
      nodeEnv: 'test',
      isProd: false,
      port: 0,
      webPort: 5173,
      databaseUrl: '',
      jwtSecret: 'test-secret-test-secret-test-secret',
      corsOrigins: true,
      logLevel: 'error',
      lanIps: [],
      turnTimeSec: 0,
      disconnectGraceMs: 20_000,
      roomTtlMs: 600_000,
      guestSignupLimitPerMin: 1000,
      profanityFilter: true,
      botDelayMs: 1000,
      mailMode: 'log' as const,
      smtpUrl: '',
      mailFrom: 'test',
    },
    users: createMemoryUserStore(),
    rng: createSeededRng(11),
    healthCheck: async () => {},
    botMs: 20,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  stop = async () => {
    await close();
    await app.close().catch(() => {});
  };
});

afterEach(() => {
  while (open.length) open.pop()?.disconnect();
});
afterAll(async () => {
  await stop();
});

async function signup(nickname: string, avatar = 'fox'): Promise<AuthResponse> {
  const res = await fetch(`${base}/api/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, avatar }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AuthResponse;
}

/** Connects and waits for the initial room:state; keeps the latest room in `client.latest`. */
async function login(token: string) {
  const client: Client = connect(base, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  open.push(client);
  const box = { latest: undefined as RoomView | null | undefined };
  const waiters: (() => void)[] = [];
  client.on('room:state', (room) => {
    box.latest = room;
    waiters.splice(0).forEach((w) => w());
  });
  const until = (pred: (room: RoomView | null) => boolean) =>
    new Promise<RoomView | null>((resolve, reject) => {
      const check = () => {
        if (box.latest !== undefined && pred(box.latest)) {
          clearTimeout(timer);
          resolve(box.latest);
        } else waiters.push(check);
      };
      const timer = setTimeout(() => reject(new Error('timed out waiting for room state')), 2000);
      check();
    });
  await until(() => true);
  return { client, box, until };
}

const call = <T>(fn: (ack: Ack<T>) => void) =>
  new Promise<Parameters<Ack<T>>[0]>((resolve) => fn(resolve));

describe('REST auth', () => {
  it('creates a guest, returns a token and resolves /api/me', async () => {
    const { token, user } = await signup('  Ada  ');
    expect(user).toMatchObject({ nickname: 'Ada', avatar: 'fox', isGuest: true });
    const me = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(user.id);
  });

  it('rejects bad input and bad tokens', async () => {
    const bad = await fetch(`${base}/api/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'x', avatar: 'dragon' }),
    });
    expect(bad.status).toBe(400);
    const me = await fetch(`${base}/api/me`, { headers: { authorization: 'Bearer nope' } });
    expect(me.status).toBe(401);
  });

  it('serves a health check', async () => {
    const res = await fetch(`${base}/api/healthz`);
    expect(await res.json()).toEqual({ ok: true, app: 'Pogo' });
  });
});

describe('sockets', () => {
  it('refuses connections without a valid token', async () => {
    const client: Client = connect(base, {
      auth: { token: 'bad' },
      transports: ['websocket'],
      forceNew: true,
    });
    open.push(client);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toBe('unauthorized');
  });

  it('plays a two-player Yatzy game over sockets, including a reconnect', async () => {
    const [ua, ub] = [await signup('Alice'), await signup('Bob', 'cat')];
    const A = await login(ua.token);
    const B = await login(ub.token);

    const created = await call<RoomView>((ack) =>
      A.client.emit('room:create', { gameId: 'yatzy', visibility: 'private' }, ack),
    );
    if (!created.ok) throw new Error(created.error);
    const code = created.data.code;

    const joined = await call<RoomView>((ack) =>
      B.client.emit('room:join', { code: code.toLowerCase() }, ack),
    );
    expect(joined.ok).toBe(true);
    await A.until((r) => r?.members.length === 2);

    // Only the host can start
    expect((await call((ack) => B.client.emit('room:start', {}, ack))).ok).toBe(false);
    expect((await call((ack) => A.client.emit('room:start', {}, ack))).ok).toBe(true);
    const playing = await B.until((r) => r?.status === 'playing');
    expect(playing?.game?.currentPlayers).toEqual([ua.user.id]);

    // Bob can't move out of turn; Alice rolls.
    const roll = { move: { type: 'roll', held: [false, false, false, false, false] } };
    expect(await call<null>((ack) => B.client.emit('game:move', roll, ack))).toEqual({
      ok: false,
      error: 'Not your turn',
    });
    expect((await call<null>((ack) => A.client.emit('game:move', roll, ack))).ok).toBe(true);
    const afterRoll = await B.until((r) => (r?.game?.view as { dice: number[] }).dice.length === 5);
    const dice = (afterRoll?.game?.view as { dice: number[] }).dice;
    expect(dice.every((d) => d >= 1 && d <= 6)).toBe(true);

    // Bob's phone drops and he reconnects with the same token: he is put back in the game.
    B.client.disconnect();
    await A.until((r) => r?.members.find((m) => m.id === ub.user.id)?.connected === false);
    const B2 = await login(ub.token);
    expect(B2.box.latest?.status).toBe('playing');
    expect((B2.box.latest?.game?.view as { dice: number[] }).dice).toEqual(dice);
    await A.until((r) => r?.members.find((m) => m.id === ub.user.id)?.connected === true);
  });

  it('rejects malformed payloads and unknown games', async () => {
    const { token } = await signup('Carol');
    const C = await login(token);
    expect((await call((ack) => C.client.emit('room:join', { code: '!!' }, ack))).ok).toBe(false);
    const res = await call((ack) => C.client.emit('room:create', { gameId: 'chess' }, ack));
    expect(res).toEqual({ ok: false, error: 'Unknown game' });
  });

  it('rate limits floods of events', async () => {
    const { token } = await signup('Dave');
    const D = await login(token);
    const results = await Promise.all(
      Array.from({ length: 60 }, () => call((ack) => D.client.emit('room:leave', {}, ack))),
    );
    expect(results.some((r) => !r.ok && r.error === 'Slow down a little')).toBe(true);
  });
});

/** Resolve with the next `event` payload that satisfies `pred`. */
function nextEvent<T>(
  client: Client,
  event: 'lobby:list' | 'chat:message',
  pred: (v: T) => boolean,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 2000);
    const handler = (value: unknown) => {
      if (!pred(value as T)) return;
      clearTimeout(timer);
      (client as Socket).off(event, handler);
      resolve(value as T);
    };
    (client as Socket).on(event, handler);
  });
}

describe('public lobby over sockets', () => {
  it('pushes live updates to subscribers as public rooms appear, fill and vanish', async () => {
    const [ua, ub] = [await signup('Lobbyist'), await signup('Host')];
    const watcher = await login(ua.token);
    const host = await login(ub.token);

    const initial = await call<PublicRoomSummary[]>((ack) =>
      watcher.client.emit('lobby:subscribe', {}, ack),
    );
    expect(initial.ok && initial.data.filter((r) => r.hostNickname === 'Host')).toEqual([]);

    const appeared = nextEvent<PublicRoomSummary[]>(watcher.client, 'lobby:list', (l) =>
      l.some((r) => r.hostNickname === 'Host'),
    );
    const created = await call<RoomView>((ack) =>
      host.client.emit('room:create', { gameId: 'yatzy', visibility: 'public' }, ack),
    );
    if (!created.ok) throw new Error(created.error);
    const listed = (await appeared).find((r) => r.code === created.data.code);
    expect(listed).toMatchObject({ gameId: 'yatzy', players: 1, maxPlayers: 6, hostAvatar: 'fox' });

    // Going private removes it from the list.
    const vanished = nextEvent<PublicRoomSummary[]>(
      watcher.client,
      'lobby:list',
      (l) => !l.some((r) => r.code === created.data.code),
    );
    await call((ack) => host.client.emit('room:settings', { visibility: 'private' }, ack));
    await vanished;

    // After unsubscribing nothing more arrives.
    await call((ack) => watcher.client.emit('lobby:unsubscribe', {}, ack));
    let extra = 0;
    watcher.client.on('lobby:list', () => extra++);
    await call((ack) => host.client.emit('room:settings', { visibility: 'public' }, ack));
    await new Promise((r) => setTimeout(r, 400));
    expect(extra).toBe(0);
  });

  it('quick match pairs two players in the same public room', async () => {
    const [ua, ub] = [await signup('QuickA'), await signup('QuickB')];
    const [a, b] = [await login(ua.token), await login(ub.token)];
    const first = await call<RoomView>((ack) =>
      a.client.emit('room:quickplay', { gameId: 'yatzy' }, ack),
    );
    const second = await call<RoomView>((ack) =>
      b.client.emit('room:quickplay', { gameId: 'yatzy' }, ack),
    );
    if (!first.ok || !second.ok) throw new Error('quick match failed');
    // (Other tests may have left public rooms open; quick match joins the longest-waiting one.)
    expect(second.data.code).toBe(first.data.code);
    const ids = second.data.members.map((m) => m.id);
    expect(ids).toContain(ua.user.id);
    expect(ids).toContain(ub.user.id);
  });
});

describe('chat over sockets', () => {
  it('delivers messages to the room, masks profanity, and replays history on reconnect', async () => {
    const [ua, ub] = [await signup('Chatty'), await signup('Listener')];
    const [a, b] = [await login(ua.token), await login(ub.token)];
    const created = await call<RoomView>((ack) =>
      a.client.emit('room:create', { gameId: 'yatzy' }, ack),
    );
    if (!created.ok) throw new Error(created.error);
    await call((ack) => b.client.emit('room:join', { code: created.data.code }, ack));

    const received = nextEvent<ChatMessage>(b.client, 'chat:message', (m) => m.text.includes('so'));
    const sent = await call<null>((ack) =>
      a.client.emit('chat:send', { text: '  well shit, so close  ' }, ack),
    );
    expect(sent.ok).toBe(true);
    expect(await received).toMatchObject({
      userId: ua.user.id,
      nickname: 'Chatty',
      text: 'well ****, so close',
    });

    // Bob refreshes: he gets the history back.
    b.client.disconnect();
    const history = new Promise<ChatMessage[]>((resolve) => {
      const b2 = connect(base, {
        auth: { token: ub.token },
        transports: ['websocket'],
        forceNew: true,
      });
      open.push(b2);
      b2.on('chat:history', resolve);
    });
    expect((await history).map((m) => m.text)).toEqual(['well ****, so close']);
  });

  it('rejects empty, oversized and out-of-room messages', async () => {
    const { token } = await signup('Lonely');
    const c = await login(token);
    expect(await call((ack) => c.client.emit('chat:send', { text: 'hi' }, ack))).toEqual({
      ok: false,
      error: 'You are not in a room',
    });
    await call((ack) => c.client.emit('room:create', { gameId: 'yatzy' }, ack));
    expect((await call((ack) => c.client.emit('chat:send', { text: '   ' }, ack))).ok).toBe(false);
    expect(
      (await call((ack) => c.client.emit('chat:send', { text: 'x'.repeat(301) }, ack))).ok,
    ).toBe(false);
  });

  it('rate limits chat floods per user', async () => {
    const { token } = await signup('Spammer');
    const s = await login(token);
    await call((ack) => s.client.emit('room:create', { gameId: 'yatzy' }, ack));
    const results: Awaited<ReturnType<typeof call>>[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(await call((ack) => s.client.emit('chat:send', { text: `spam ${i}` }, ack)));
    }
    expect(results.filter((r) => r.ok)).toHaveLength(5); // the burst
    expect(results.at(-1)).toEqual({ ok: false, error: 'You are sending messages too fast' });
  });
});

describe('nickname moderation', () => {
  it('refuses profane nicknames', async () => {
    const res = await fetch(`${base}/api/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'Big Sh1t', avatar: 'fox' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      'Please pick a different nickname',
    );
  });
});

describe('playing against the computer over sockets', () => {
  it('starts straight away, shows the computer as a member, and the computer plays by itself', async () => {
    const { token, user } = await signup('Solo');
    const me = await login(token);
    const created = await call<RoomView>((ack) =>
      me.client.emit('room:create', { gameId: 'karma', bots: 1, autoStart: true }, ack),
    );
    if (!created.ok) throw new Error(created.error);
    expect(created.data).toMatchObject({ status: 'playing', bots: 1, visibility: 'public' });
    const bot = created.data.members.find((m) => m.bot);
    expect(bot).toMatchObject({ nickname: 'Robo', avatar: 'robot', connected: true });

    type Seats = {
      phase: string;
      players: { id: string; hand: number[] | null; ready: boolean }[];
    };
    const seats = (r: RoomView | null) => r?.game?.view as Seats;
    // Its hand is private; it readies itself after a moment without any socket.
    const ready = await me.until((r) => !!seats(r)?.players.find((p) => p.id === bot!.id)?.ready);
    const botSeat = seats(ready).players.find((p) => p.id === bot!.id)!;
    expect(botSeat.hand).toBeNull();
    expect(seats(ready).players.find((p) => p.id === user.id)!.hand).toHaveLength(3);

    // Once I am ready too the game moves on to the play phase.
    const readyMove = await call<null>((ack) =>
      me.client.emit('game:move', { move: { type: 'ready' } }, ack),
    );
    expect(readyMove.ok).toBe(true);
    await me.until((r) => seats(r)?.phase === 'play');
  });

  it('rejects computers for games without them, and normal Yatzy rooms still work', async () => {
    const { token } = await signup('Nobot');
    const me = await login(token);
    const res = await call((ack) =>
      me.client.emit('room:create', { gameId: 'yatzy', bots: 1, autoStart: true }, ack),
    );
    expect(res).toEqual({ ok: false, error: 'Yatzy cannot be played against the computer' });
    const solo = await call<RoomView>((ack) =>
      me.client.emit('room:create', { gameId: 'yatzy' }, ack),
    );
    expect(solo.ok).toBe(true);
  });
});
