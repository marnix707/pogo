import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createSeededRng } from '@pogo/shared';
import type {
  Ack,
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
    },
    users: createMemoryUserStore(),
    rng: createSeededRng(11),
    healthCheck: async () => {},
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
