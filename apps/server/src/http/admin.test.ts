import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import type { Role } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';
import type { UserStore } from '../auth/userStore';
import { hashPassword } from '../auth/passwords';

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
