import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';
import type { UserStore } from '../auth/userStore';
import { recordFinishedGame } from '../stats/record';

const config = {
  nodeEnv: 'test' as const,
  isProd: false,
  port: 0,
  webPort: 5173,
  databaseUrl: '',
  jwtSecret: 'test-secret-test-secret-test-secret',
  corsOrigins: true as const,
  logLevel: 'error' as const,
  lanIps: [],
  turnTimeSec: 0,
  disconnectGraceMs: 20_000,
  roomTtlMs: 600_000,
  guestSignupLimitPerMin: 1000,
  profanityFilter: false,
  botDelayMs: 1000,
  mailMode: 'log' as const,
  brevoApiKey: '',
  publicBaseUrl: '',
  smtpUrl: '',
  mailFrom: 'test',
};

let users: UserStore;
let server: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  users = createMemoryUserStore();
  server = await buildApp({
    config,
    users,
    rng: createSeededRng(1),
    healthCheck: async () => {},
  });
});
afterAll(async () => {
  await server.close();
  await server.app.close();
});

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token?: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  server.app.inject({
    method,
    url,
    payload: payload as object,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });

async function guest(nickname: string) {
  const res = await call('POST', '/api/auth/guest', undefined, { nickname, avatar: 'fox' });
  return res.json() as { token: string; user: { id: string } };
}

const lastCode = async (email: string) =>
  (await call('GET', `/api/dev/last-mail?to=${email}`)).json().code as string;

async function register(nickname: string, email: string, password = 'secret-pass') {
  const g = await guest(nickname);
  expect((await call('POST', '/api/account/register/start', g.token, { email })).statusCode).toBe(
    200,
  );
  const res = await call('POST', '/api/account/register/verify', g.token, {
    email,
    code: await lastCode(email),
    password,
  });
  expect(res.statusCode).toBe(200);
  return { ...g, email, password, user: res.json().user };
}

describe('registering', () => {
  it('upgrades the guest in place: same id and token, now registered', async () => {
    const acc = await register('Ann', 'Ann@Example.com');
    expect(acc.user.isGuest).toBe(false);
    expect(acc.user.email).toBe('ann@example.com');
    const me = await call('GET', '/api/me', acc.token);
    expect(me.json().user).toMatchObject({ id: acc.user.id, isGuest: false });
  });

  it('keeps the results played as a guest', async () => {
    const g = await guest('Early');
    await recordFinishedGame(users, {
      gameId: 'yatzy',
      matchId: 'M-1',
      results: { rankings: [{ playerId: g.user.id, score: 250, rank: 1 }] },
      humans: [g.user.id],
      players: 1,
      bots: 0,
    });
    await call('POST', '/api/account/register/start', g.token, { email: 'early@example.com' });
    await call('POST', '/api/account/register/verify', g.token, {
      email: 'early@example.com',
      code: await lastCode('early@example.com'),
      password: 'secret-pass',
    });
    const stats = (await call('GET', '/api/me/stats', g.token)).json().stats;
    expect(stats).toEqual([expect.objectContaining({ gameId: 'yatzy', games: 1, bestScore: 250 })]);
  });

  it('rejects a wrong code, counts attempts, and refuses a taken email', async () => {
    const taken = await register('Taken', 'taken@example.com');
    const g = await guest('Other');
    expect(
      (await call('POST', '/api/account/register/start', g.token, { email: taken.email }))
        .statusCode,
    ).toBe(409);

    await call('POST', '/api/account/register/start', g.token, { email: 'new@example.com' });
    const real = await lastCode('new@example.com');
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await call('POST', '/api/account/register/verify', g.token, {
        email: 'new@example.com',
        code: wrong,
        password: 'secret-pass',
      });
      expect(res.statusCode).toBe(400);
    }
    // Five wrong guesses burn the code: even the right one no longer works.
    const res = await call('POST', '/api/account/register/verify', g.token, {
      email: 'new@example.com',
      code: real,
      password: 'secret-pass',
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates email and password', async () => {
    const g = await guest('Bad');
    expect(
      (await call('POST', '/api/account/register/start', g.token, { email: 'nope' })).statusCode,
    ).toBe(400);
    await call('POST', '/api/account/register/start', g.token, { email: 'bad@example.com' });
    const res = await call('POST', '/api/account/register/verify', g.token, {
      email: 'bad@example.com',
      code: await lastCode('bad@example.com'),
      password: 'short',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('login and password reset', () => {
  it('logs in with the right password only', async () => {
    const acc = await register('Lola', 'lola@example.com');
    const bad = await call('POST', '/api/auth/login', undefined, {
      email: acc.email,
      password: 'wrong-pass',
    });
    expect(bad.statusCode).toBe(401);
    const unknown = await call('POST', '/api/auth/login', undefined, {
      email: 'x@example.com',
      password: 'wrong-pass',
    });
    expect(unknown.json().error).toBe(bad.json().error);
    const ok = await call('POST', '/api/auth/login', undefined, {
      email: acc.email,
      password: acc.password,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.id).toBe(acc.user.id);
  });

  it('resets a password with an emailed code, and does not reveal unknown emails', async () => {
    const acc = await register('Rita', 'rita@example.com');
    const start = await call('POST', '/api/auth/reset/start', undefined, { email: acc.email });
    expect(start.statusCode).toBe(200);
    expect(
      (await call('POST', '/api/auth/reset/start', undefined, { email: 'ghost@example.com' }))
        .statusCode,
    ).toBe(200);
    const res = await call('POST', '/api/auth/reset/verify', undefined, {
      email: acc.email,
      code: await lastCode(acc.email),
      password: 'brand-new-pass',
    });
    expect(res.statusCode).toBe(200);
    const login = await call('POST', '/api/auth/login', undefined, {
      email: acc.email,
      password: 'brand-new-pass',
    });
    expect(login.statusCode).toBe(200);
  });
});

describe('stats, leaderboard and merge', () => {
  const finish = (id: string, matchId: string, score: number, rank = 1) =>
    recordFinishedGame(users, {
      gameId: 'yatzy',
      matchId,
      results: {
        rankings: [
          { playerId: id, score, rank },
          { playerId: 'bot:1', score: 1, rank: 2 },
        ],
      },
      humans: [id],
      players: 2,
      bots: 1,
    });

  it('flags a new personal best and only lists registered players on the leaderboard', async () => {
    const acc = await register('Champ', 'champ@example.com');
    const g = await guest('JustGuest');
    await finish(acc.user.id, 'A-1', 200);
    await finish(acc.user.id, 'A-2', 300);
    await finish(g.user.id, 'B-1', 999);
    const stats = (await call('GET', '/api/me/stats', acc.token)).json().stats[0];
    expect(stats).toMatchObject({ games: 2, wins: 2, bestScore: 300, lastIsBest: true });
    const board = (await call('GET', '/api/leaderboard?game=yatzy')).json().entries;
    expect(board.map((e: { nickname: string }) => e.nickname)).toContain('Champ');
    expect(board.map((e: { nickname: string }) => e.nickname)).not.toContain('JustGuest');
  });

  it('records each match once and ignores computer players', async () => {
    const g = await guest('Once');
    await finish(g.user.id, 'C-1', 100);
    await finish(g.user.id, 'C-1', 100);
    const stats = (await call('GET', '/api/me/stats', g.token)).json().stats[0];
    expect(stats.games).toBe(1);
  });

  it('merges a device guest into the account, but never absorbs a registered user', async () => {
    const acc = await register('Merger', 'merger@example.com');
    const g = await guest('DeviceGuest');
    await finish(g.user.id, 'D-1', 150);
    const merged = await call('POST', '/api/account/merge', acc.token, { guestToken: g.token });
    expect(merged.json().moved).toBe(1);
    expect((await call('GET', '/api/me', g.token)).statusCode).toBe(401);
    const stats = (await call('GET', '/api/me/stats', acc.token)).json().stats[0];
    expect(stats.games).toBe(1);

    const other = await register('Other2', 'other2@example.com');
    const again = await call('POST', '/api/account/merge', acc.token, { guestToken: other.token });
    expect(again.statusCode).toBe(400);
  });
});

describe('profile picture and deletion', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(40),
  ]);

  it('lets registered users upload an image, validated by content', async () => {
    const acc = await register('Pic', 'pic@example.com');
    const guestUser = await guest('NoPic');
    const asGuest = await call('PUT', '/api/me/avatar', guestUser.token, png, {
      'content-type': 'image/png',
    });
    expect(asGuest.statusCode).toBe(403);

    const fake = await call('PUT', '/api/me/avatar', acc.token, Buffer.alloc(100, 1), {
      'content-type': 'image/png',
    });
    expect(fake.statusCode).toBe(400);
    const tooBig = await call('PUT', '/api/me/avatar', acc.token, Buffer.alloc(90_000, 1), {
      'content-type': 'image/png',
    });
    expect(tooBig.statusCode).toBe(413);

    const ok = await call('PUT', '/api/me/avatar', acc.token, png, { 'content-type': 'image/png' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.avatar).toBe(`img:${acc.user.id}:1`);
    const img = await call('GET', `/api/users/${acc.user.id}/avatar`);
    expect(img.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(img.rawPayload, png)).toBe(0);

    const cleared = await call('DELETE', '/api/me/avatar', acc.token);
    expect(cleared.json().user.avatar).toBe('fox');
    expect((await call('GET', `/api/users/${acc.user.id}/avatar`)).statusCode).toBe(404);
  });

  it('deletes an account only with the right password', async () => {
    const acc = await register('Gone', 'gone@example.com');
    expect((await call('DELETE', '/api/me', acc.token, { password: 'nope-nope' })).statusCode).toBe(
      401,
    );
    expect(
      (await call('DELETE', '/api/me', acc.token, { password: acc.password })).statusCode,
    ).toBe(200);
    expect((await call('GET', '/api/me', acc.token)).statusCode).toBe(401);
  });
});
