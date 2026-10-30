import { displayName } from '@pogo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import type { Role } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';
import type { UserStore } from '../auth/userStore';
import { hashPassword } from '../auth/passwords';
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
  adminEmails: ['boss@example.com'],
  devEmails: ['dev@example.com'],
};

let users: UserStore;
let server: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  users = createMemoryUserStore();
  server = await buildApp({ config, users, rng: createSeededRng(1), healthCheck: async () => {} });
});
afterAll(async () => {
  await server.close();
  await server.app.close();
});

const call = (
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  token?: string,
  payload?: unknown,
  remoteAddress?: string,
) =>
  server.app.inject({
    method,
    url,
    payload: payload as object,
    remoteAddress,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

async function guest(nickname: string, ip?: string) {
  const res = await call('POST', '/api/auth/guest', undefined, { nickname, avatar: 'fox' }, ip);
  return res.json() as { token: string; user: { id: string } };
}

/** A registered player with a role (registered directly in the store: the mail flow is tested elsewhere). */
async function staffMember(nickname: string, role: Role) {
  const g = await guest(nickname);
  await users.register(
    g.user.id,
    `${nickname.toLowerCase()}@example.com`,
    await hashPassword('secret-pass'),
  );
  if (role !== 'user') await users.setRole(g.user.id, role);
  return g;
}

describe('admin access', () => {
  it('is closed to players and open to staff', async () => {
    const p = await guest('Plain');
    expect((await call('GET', '/api/admin/users', p.token)).statusCode).toBe(403);
    expect((await call('GET', '/api/admin/users')).statusCode).toBe(401);
    const mod = await staffMember('Modo', 'moderator');
    const res = await call('GET', '/api/admin/users?q=plain', mod.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().users[0]).toMatchObject({ nickname: 'Plain', role: 'user', isDev: false });
  });

  it('makes the first admin from ADMIN_EMAILS when they log in', async () => {
    const g = await guest('Boss');
    await users.register(g.user.id, 'boss@example.com', await hashPassword('secret-pass'));
    const res = await call('POST', '/api/auth/login', undefined, {
      email: 'boss@example.com',
      password: 'secret-pass',
    });
    expect(res.json().user.role).toBe('admin');
  });

  it('makes a DEV_EMAILS account admin with the dev tag when they log in', async () => {
    const g = await guest('Coder');
    await users.register(g.user.id, 'dev@example.com', await hashPassword('secret-pass'));
    const res = await call('POST', '/api/auth/login', undefined, {
      email: 'dev@example.com',
      password: 'secret-pass',
    });
    expect(res.json().user).toMatchObject({ role: 'admin', isDev: true });
  });
});

describe('titles (developers only)', () => {
  it('sets a prefix and suffix that show in the display name', async () => {
    const dev = await staffMember('Devy', 'admin');
    await users.setDev(dev.user.id, true);
    const fan = await staffMember('Fanny', 'user');
    const visitor = await guest('Visitor');

    // The player list can be limited to registered players (the panel's default).
    const registered = await call('GET', '/api/admin/users?q=visitor&registered=1', dev.token);
    expect(registered.json().users).toHaveLength(0);
    const everyone = await call('GET', '/api/admin/users?q=visitor', dev.token);
    expect(everyone.json().users).toHaveLength(1);

    const set = await call('POST', `/api/admin/users/${fan.user.id}/titles`, dev.token, {
      prefix: ' 👑 ',
      suffix: 'the Great',
    });
    expect(set.statusCode).toBe(200);
    const me = await users.get(fan.user.id);
    expect(me).toMatchObject({ prefix: '👑', suffix: 'the Great' });
    expect(displayName(me!)).toBe('👑 Fanny the Great');

    // Clearing removes both.
    await call('POST', `/api/admin/users/${fan.user.id}/titles`, dev.token, {
      prefix: '',
      suffix: '',
    });
    expect(displayName((await users.get(fan.user.id))!)).toBe('Fanny');

    // Too long, guests and non-developers are refused.
    const long = await call('POST', `/api/admin/users/${fan.user.id}/titles`, dev.token, {
      prefix: 'x'.repeat(40),
      suffix: '',
    });
    expect(long.statusCode).toBe(400);
    const guestTarget = await call(
      'POST',
      `/api/admin/users/${visitor.user.id}/titles`,
      dev.token,
      {
        prefix: 'Hi',
        suffix: '',
      },
    );
    expect(guestTarget.statusCode).toBe(400);
    const plainAdmin = await staffMember('Adminonly', 'admin');
    expect(
      (
        await call('POST', `/api/admin/users/${fan.user.id}/titles`, plainAdmin.token, {
          prefix: 'x',
          suffix: '',
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('credits', () => {
  it('names the developer account (first DEV_EMAILS address) on the home screen', async () => {
    const dev = await guest('CreditDev');
    await users.register(dev.user.id, 'dev@example.com', await hashPassword('secret-pass'));
    await users.setDev(dev.user.id, true);
    const res = await call('GET', '/api/credits');
    expect(res.statusCode).toBe(200);
    // (An earlier test may already have registered dev@example.com under another name.)
    expect(res.json().developer).toMatch(/ \(dev\)$/);
  });
});

describe('recovery links for guests', () => {
  it('an admin gets a link that logs in as that guest; others cannot', async () => {
    const admin = await staffMember('Recover1', 'admin');
    const mod = await staffMember('Recover2', 'moderator');
    const lost = await guest('LostGuest');
    const res = await call('POST', `/api/admin/users/${lost.user.id}/recovery`, admin.token);
    expect(res.statusCode).toBe(200);
    const { token } = res.json() as { token: string };
    // The token is a normal login for that guest.
    const me = await call('GET', '/api/me', token);
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(lost.user.id);
    // It is written to the audit log.
    const audit = await call('GET', '/api/admin/audit', admin.token);
    expect(
      (audit.json().audit as { action: string }[]).some((r) => r.action === 'recovery-link'),
    ).toBe(true);
    // Moderators are refused, and registered players do not need a link.
    expect(
      (await call('POST', `/api/admin/users/${lost.user.id}/recovery`, mod.token)).statusCode,
    ).toBe(403);
    const registered = await staffMember('Registered3', 'user');
    expect(
      (await call('POST', `/api/admin/users/${registered.user.id}/recovery`, admin.token))
        .statusCode,
    ).toBe(400);
  });
});

describe('account events in the log', () => {
  it('notes a sign-up request, the email and the registration', async () => {
    const dev = await staffMember('Logger', 'admin');
    const g = await guest('Newbie');
    const start = await call('POST', '/api/account/register/start', g.token, {
      email: 'newbie@example.com',
    });
    expect(start.statusCode).toBe(200);
    const audit = await call('GET', '/api/admin/audit', dev.token);
    const actions = (audit.json().audit as { action: string; actorName: string; detail: string }[])
      .filter((r) => r.actorName === 'Newbie')
      .map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['register-requested', 'email-sent']));
    const row = (audit.json().audit as { action: string; detail: string }[]).find(
      (r) => r.action === 'email-sent',
    );
    // Addresses are masked in the log.
    expect(row?.detail).toContain('ne***@example.com');
  });
});

describe('bans', () => {
  it('shuts a banned account out of the API until the ban is lifted', async () => {
    const admin = await staffMember('Admin1', 'admin');
    const bad = await guest('Troll');
    const ban = await call('POST', `/api/admin/users/${bad.user.id}/ban`, admin.token, {
      minutes: 60,
      reason: 'spam',
    });
    expect(ban.statusCode).toBe(200);
    const me = await call('GET', '/api/me', bad.token);
    expect(me.statusCode).toBe(403);
    expect(me.json()).toMatchObject({ banned: true });
    expect(me.json().error).toContain('spam');

    const list = (await call('GET', '/api/admin/bans', admin.token)).json().bans;
    expect(list).toHaveLength(1);
    expect((await call('DELETE', `/api/admin/bans/${list[0].id}`, admin.token)).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/api/me', bad.token)).statusCode).toBe(200);
  });

  it('also blocks the last IP address, so a new guest cannot start over', async () => {
    const admin = await staffMember('Admin2', 'admin');
    const bad = await guest('IpTroll');
    await users.touch(bad.user.id, '9.9.9.9');
    await call('POST', `/api/admin/users/${bad.user.id}/ban`, admin.token, { minutes: 5 });
    const again = await call(
      'POST',
      '/api/auth/guest',
      undefined,
      { nickname: 'Again', avatar: 'fox' },
      '9.9.9.9',
    );
    expect(again.statusCode).toBe(403);
    const elsewhere = await call(
      'POST',
      '/api/auth/guest',
      undefined,
      { nickname: 'Else', avatar: 'fox' },
      '8.8.8.8',
    );
    expect(elsewhere.statusCode).toBe(201);
  });

  it('limits moderators to 7 days and to players ranked below them', async () => {
    const mod = await staffMember('Modo2', 'moderator');
    const admin = await staffMember('Admin3', 'admin');
    const victim = await guest('Victim');
    const ban = (minutes: number | null, id = victim.user.id) =>
      call('POST', `/api/admin/users/${id}/ban`, mod.token, { minutes, reason: '' });
    expect((await ban(null)).statusCode).toBe(403);
    expect((await ban(8 * 24 * 60)).statusCode).toBe(403);
    expect((await ban(24 * 60)).statusCode).toBe(200);
    expect((await ban(60, admin.user.id)).statusCode).toBe(403);
    expect((await ban(60, mod.user.id)).statusCode).toBe(400);
  });

  it('lets an admin ban for good', async () => {
    const admin = await staffMember('Admin4', 'admin');
    const bad = await guest('Forever');
    const res = await call('POST', `/api/admin/users/${bad.user.id}/ban`, admin.token, {
      minutes: null,
    });
    expect(res.json().ban.expiresAt).toBeNull();
  });
});

describe('roles and the dev tag', () => {
  it('only admins change roles and the dev tag; the tag shows behind the name in rooms', async () => {
    const admin = await staffMember('Admin5', 'admin');
    const mod = await staffMember('Modo3', 'moderator');
    const dev = await staffMember('Coder', 'user');
    expect(
      (await call('POST', `/api/admin/users/${dev.user.id}/dev`, mod.token, { isDev: true }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/api/admin/users/${dev.user.id}/dev`, admin.token, { isDev: true }))
        .statusCode,
    ).toBe(200);
    const me = (await call('GET', '/api/me', dev.token)).json().user;
    expect(me.isDev).toBe(true);
    const created = server.manager.create(me, { gameId: 'yatzy' } as never);
    expect(created.ok && created.data.members[0]?.nickname).toBe('Coder (dev)');

    const role = (r: string, token = admin.token) =>
      call('POST', `/api/admin/users/${dev.user.id}/role`, token, { role: r });
    expect((await role('moderator', mod.token)).statusCode).toBe(403);
    expect((await role('moderator')).json().user.role).toBe('moderator');
    expect((await role('user')).json().user.role).toBeUndefined();
    const guestUser = await guest('JustGuest');
    expect(
      (
        await call('POST', `/api/admin/users/${guestUser.user.id}/role`, admin.token, {
          role: 'moderator',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('keeps an audit log of what staff did', async () => {
    const admin = await staffMember('Admin6', 'admin');
    const p = await guest('Logged');
    await call('POST', `/api/admin/users/${p.user.id}/kick`, admin.token);
    const audit = (await call('GET', '/api/admin/audit', admin.token)).json().audit;
    expect(audit[0]).toMatchObject({ action: 'kick', targetName: 'Logged' });
  });
});

describe('admin analytics', () => {
  it('counts a visit when a player connects, and new players and games', async () => {
    const admin = await staffMember('Admin8', 'admin');
    const g = await guest('Visitor');
    await users.recordVisit(g.user.id, Date.now());
    // A second connection right after is the same visit; one an hour later is a new one.
    await users.recordVisit(g.user.id, Date.now() + 1000);
    await users.recordVisit(g.user.id, Date.now() + 3_700_000);
    const data = (await call('GET', '/api/admin/analytics', admin.token)).json();
    expect(data.days).toHaveLength(90);
    expect(data.today.visitors).toBeGreaterThanOrEqual(1);
    expect(data.today.visits).toBeGreaterThanOrEqual(1);
    expect(data.today.newPlayers).toBeGreaterThanOrEqual(2);
    expect(data.players.guests).toBeGreaterThanOrEqual(1);
    expect(data.trackingSince).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});

describe('admin overview, matches and chats', () => {
  it('shows the numbers, every finished match and the room chat feed', async () => {
    const admin = await staffMember('Admin7', 'admin');
    const a = await guest('Alpha');
    const b = await guest('Beta');
    await recordFinishedGame(users, {
      gameId: 'karma',
      matchId: 'ADM-1',
      results: {
        rankings: [
          { playerId: a.user.id, score: 3, rank: 1 },
          { playerId: b.user.id, score: 1, rank: 2 },
        ],
      },
      humans: [a.user.id, b.user.id],
      players: 2,
      bots: 0,
      roster: [
        { id: a.user.id, nickname: 'Alpha', avatar: 'fox', bot: false },
        { id: b.user.id, nickname: 'Beta', avatar: 'cat', bot: false },
      ],
      detail: { note: 'hi' },
    });
    const overview = (await call('GET', '/api/admin/overview', admin.token)).json();
    expect(overview.matches.today).toBeGreaterThanOrEqual(1);
    expect(overview.byGame).toEqual(
      expect.arrayContaining([expect.objectContaining({ gameId: 'karma' })]),
    );
    expect(overview.players.registered).toBeGreaterThanOrEqual(1);
    const matches = (await call('GET', '/api/admin/matches?game=karma', admin.token)).json()
      .matches;
    expect(matches[0]).toMatchObject({
      matchId: 'ADM-1',
      gameId: 'karma',
      detail: { note: 'hi' },
      players: [
        { nickname: 'Alpha', rank: 1, score: 3 },
        { nickname: 'Beta', rank: 2, score: 1 },
      ],
    });
    // One player's own matches.
    const mine = (await call('GET', `/api/admin/matches?user=${a.user.id}`, admin.token)).json();
    expect(mine.matches.map((m: { matchId: string }) => m.matchId)).toContain('ADM-1');
    // The chat feed: a message sent in a room shows up once, with the room and the sender.
    const room = server.manager.create(
      { id: a.user.id, nickname: 'Alpha', avatar: 'fox', isGuest: true },
      { gameId: 'yatzy' },
    );
    if (!room.ok) throw new Error(room.error);
    server.manager.chat(a.user.id, 'hello admin');
    const chats = (await call('GET', `/api/admin/chats?room=${room.data.code}`, admin.token)).json()
      .chats;
    expect(chats).toEqual([
      expect.objectContaining({
        roomCode: room.data.code,
        nickname: 'Alpha',
        text: 'hello admin',
        userId: a.user.id,
      }),
    ]);
    const rooms = (await call('GET', '/api/admin/rooms', admin.token)).json().rooms;
    expect(rooms.find((r: { code: string }) => r.code === room.data.code)).toMatchObject({
      host: 'Alpha',
      chatCount: 1,
      spectators: 0,
    });
    // Players have no access.
    expect((await call('GET', '/api/admin/matches', a.token)).statusCode).toBe(403);
    expect((await call('GET', '/api/admin/chats', a.token)).statusCode).toBe(403);
    expect((await call('GET', '/api/admin/overview', a.token)).statusCode).toBe(403);
    expect((await call('GET', '/api/admin/analytics', a.token)).statusCode).toBe(403);
  });
});
